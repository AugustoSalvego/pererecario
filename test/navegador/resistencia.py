# Teste de resistência: dois celulares na mesma conta fazendo ações aleatórias enquanto a internet cai,
# o servidor cai, o app é fechado e reaberto, a resposta do servidor se perde no meio do caminho e até o
# banco "volta no tempo" (como se fosse restaurado de um backup antigo). No fim, nada pode faltar nem
# duplicar, e os dois celulares têm de mostrar exatamente o que está no servidor.
#
# Precisa de Python com Playwright e do Chrome. Em um terminal:
#   node test/navegador/servidor_teste.mjs
# Em outro:
#   python3 test/navegador/resistencia.py [semente] [passos]
# Para ver o teste falhar quando a recuperação está desligada, comente a primeira linha de
# checkServerMemory em client/js/store.js e rode de novo.
import asyncio, random, json, sys, urllib.request
from playwright.async_api import async_playwright
BASE='http://localhost:8099'
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else random.randint(1, 99999)
STEPS = int(sys.argv[2]) if len(sys.argv) > 2 else 90
rnd = random.Random(SEED)
def qa(path): return json.loads(urllib.request.urlopen(BASE+path).read())
def admin_post(path, body):
    req = urllib.request.Request(BASE+path, data=json.dumps(body).encode(), headers={'X-Admin-Key':'teste-resistencia','Content-Type':'application/json'}, method='POST'); urllib.request.urlopen(req)
CAP = """async () => { const g=await import('/js/shared/game.js'); const {store}=await import('/js/store.js'); const {geo}=await import('/js/geo.js'); const {getCatalog}=await import('/js/catalog.js');
  if (!store.view?.player) return null;
  const id=store.view.player.id; const w=g.windowOf(store.now()); const all=[];
  for (const b of g.pondsNear(geo.pos,400,id)) all.push(...g.spawnsFor(b,w,getCatalog(),id).filter(s=>g.visibleInMode(s,'gps') && !store.view.capturedSpawns.has(s.id)));
  if (!all.length) return null; const s=all[Math.floor(Math.random()*all.length)]; await store.capture(s,{lat:s.lat,lng:s.lng},'gps'); return s.id }"""
STATE = "(async()=>{const {store}=await import('/js/store.js'); if(!store.view?.player) return null; return {spawns: store.view.captures.map(c=>c.spawnId), fila: store.outbox.length, pend: store.view.captures.filter(c=>c.pending).length}})()"
async def device(b, name):
    ctx = await b.new_context(viewport={'width':390,'height':844}, is_mobile=True, geolocation={'latitude':-22.9519,'longitude':-43.2105,'accuracy':8}, permissions=['geolocation'], locale='pt-BR')
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    return {'name': name, 'ctx': ctx, 'page': page, 'errs': errs, 'offline': False}
async def login(d, email, register=False):
    p = d['page']
    await p.goto(BASE); await p.wait_for_timeout(1500)
    if register:
        await p.click('.segmented [data-mode=register]'); await p.fill('input[name=displayName]', 'Resistência')
    await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'senhaforte1')
    await p.click('button[type=submit]'); await p.wait_for_selector('.status-pill', timeout=20000); await p.wait_for_timeout(1500)
    if await p.query_selector('.tutorial'):
        await p.click('.tutorial .skip'); await p.wait_for_timeout(300); await p.click('.tutorial .next'); await p.wait_for_timeout(800)
async def main():
    print('semente', SEED, '| passos', STEPS)
    email = f'resiste{SEED}{sys.argv[3] if len(sys.argv) > 3 else ""}@gmail.com'
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', args=['--no-sandbox'])
        A = await device(b, 'A'); B = await device(b, 'B')
        await login(A, email, register=True); await login(B, email)
        done = set(); counts = {}
        for i in range(STEPS):
            d = rnd.choice([A, B]); p = d['page']
            act = rnd.choices(['capturar', 'internet', 'servidor', 'fechar', 'resposta_perdida', 'desastre'], [55, 14, 6, 10, 10, 5])[0]
            try:
                if act == 'capturar':
                    s = await p.evaluate(CAP)
                    if s: done.add(s)
                    else: act = 'capturar(nenhuma)'
                elif act == 'internet':
                    d['offline'] = not d['offline']; await d['ctx'].set_offline(d['offline'])
                elif act == 'servidor':
                    admin_post('/api/admin/outage', {'seconds': rnd.choice([3, 6, 10])})
                elif act == 'fechar':
                    await p.reload(); await p.wait_for_selector('.status-pill', timeout=20000); await p.wait_for_timeout(800)
                elif act == 'resposta_perdida':
                    await p.evaluate("import('/js/sync.js').then(m=>{m.sync.dropNextResponse=true})")
                elif act == 'desastre':
                    qa(f'/__teste/desastre?email={email}&segundos={rnd.choice([10, 30, 90])}')
            except Exception as e:
                print('  passo', i, act, 'erro do teste:', str(e)[:120])
            counts[act] = counts.get(act, 0) + 1
            await p.wait_for_timeout(rnd.choice([150, 400, 900]))
        print('ações:', counts, '| capturas feitas:', len(done))
        # fim: todo mundo online, espera esvaziar as filas
        admin_post('/api/admin/outage', {'seconds': 0})
        for d in (A, B):
            d['offline'] = False; await d['ctx'].set_offline(False)
        for _ in range(60):
            for d in (A, B): await d['page'].evaluate("import('/js/sync.js').then(m=>m.sync.kick(0))")
            await A['page'].wait_for_timeout(1500)
            sa = await A['page'].evaluate(STATE); sb = await B['page'].evaluate(STATE)
            if sa and sb and sa['fila'] == 0 and sb['fila'] == 0: break
        await A['page'].wait_for_timeout(3000)
        for d in (A, B): await d['page'].evaluate("import('/js/sync.js').then(m=>m.sync.kick(0))")
        await A['page'].wait_for_timeout(3000)
        srv = set(qa(f'/__teste/contagem?email={email}')['spawns'])
        sa = await A['page'].evaluate(STATE); sb = await B['page'].evaluate(STATE)
        n_srv = qa(f'/__teste/contagem?email={email}')['captures']
        print('servidor:', n_srv, 'capturas (', len(srv), 'diferentes ) | feitas nos celulares:', len(done))
        print('faltando no servidor:', sorted(done - srv))
        print('a mais no servidor:', sorted(srv - done))
        print('duplicadas no servidor:', n_srv - len(srv))
        print('celular A igual ao servidor?', set(sa['spawns']) == srv, '| fila', sa['fila'], '| celular B igual?', set(sb['spawns']) == srv, '| fila', sb['fila'])
        print('erros JS:', A['errs'][:3], B['errs'][:3])
        ok = done == srv and n_srv == len(srv) and set(sa['spawns']) == srv and set(sb['spawns']) == srv
        print('RESULTADO:', 'NADA PERDIDO, NADA DUPLICADO' if ok else 'PROBLEMA')
        await b.close()
asyncio.run(main())
