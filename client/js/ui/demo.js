// Painel de demonstração: aciona, na frente do professor, cada cenário dos testes
// obrigatórios (offline, servidor fora, falha no meio da sincronização, reenvio,
// conflito) e permite simular o GPS para apresentar em sala.
import { store } from '../store.js';
import { sync } from '../sync.js';
import { geo } from '../geo.js';
import { api } from '../api.js';
import * as db from '../db.js';
import { sensors } from '../sensors.js';
import { distanceM } from '../shared/game.js';
import { icons } from './icons.js';
import { $, esc, openSheet, closeSheet, toast, fmtTime, fmtDist } from './common.js';

export function openDemo(ctx) {
  const s = store.settings;
  const sheet = openSheet(`<div class="demo">
    <h3>Painel de demonstração</h3>
    <p class="lead">Ferramentas para mostrar o funcionamento online/offline, a sincronização e o tratamento de falhas.</p>

    <h4>Conexão</h4>
    <div class="card tog" data-tog="offline"><div><div class="t">Simular modo avião</div><div class="s">O app para de falar com o servidor (igual a desligar a internet)</div></div><div class="switch ${s.forcedOffline ? 'on' : ''}"></div></div>
    <div class="acts" style="margin-top:8px">
      <button class="btn small coral" data-act="outage">Derrubar servidor por 60 s</button>
      <button class="btn small ghost" data-act="restore">Religar servidor</button>
      <button class="btn small sun" data-act="drop">Perder a resposta da próxima sincronização</button>
      <button class="btn small water" data-act="resend">Reenviar operação já confirmada</button>
    </div>

    <h4>Localização</h4>
    <div class="card tog" data-tog="sim"><div><div class="t">GPS simulado</div><div class="s">Toque no mapa para o explorador andar até lá</div></div><div class="switch ${geo.mode === 'sim' ? 'on' : ''}"></div></div>
    <div class="list brejo-list" style="margin-top:8px"></div>

    <h4>Sensores</h4>
    <div class="acts"><button class="btn small" data-act="shake">${icons.shake} Simular chacoalhar</button><button class="btn small ghost" data-act="perm">Pedir permissão dos sensores</button></div>

    <h4>Administração dos brejos</h4>
    <div class="inline-input"><input class="admin-key" type="password" placeholder="Chave de administrador" value="${esc(s.adminKey || '')}"></div>
    <div class="inline-input" style="margin-top:8px"><input class="brejo-name" placeholder="Nome do novo brejo (ex.: Lago do Bloco C)"><input class="brejo-radius" type="number" value="35" min="10" max="200" style="max-width:76px"></div>
    <button class="btn small block" data-act="create" style="margin-top:8px">${icons.plus} Criar brejo onde estou</button>
    <div class="inline-input" style="margin-top:10px"><input class="campus-radius" type="number" value="${store.campus?.radius || 500}" min="100" max="3000" style="max-width:96px"><button class="btn small water" data-act="campus" style="flex:1">Definir campus aqui (raio em m)</button></div>
    <div class="s" style="font-size:12.5px;color:var(--ink-soft);margin-top:6px">${store.campus ? `Campus definido: raio de ${store.campus.radius} m.` : 'Sem área do campus: só aparecem os brejos criados à mão.'} Dentro da área, o jogo espalha lagoinhas sozinho.</div>
    <a class="btn small ghost block" href="admin" target="_blank" style="margin-top:8px;text-decoration:none">Abrir painel do servidor</a>

    <h4>Fila de sincronização <span class="qn"></span></h4>
    <div class="card opq" style="padding:6px 12px"></div>

    <h4>Registro de eventos</h4>
    <div class="logbox"></div>
  </div>`, { onClose: () => store.removeEventListener('log', onLog) });

  const adminKey = () => {
    const k = $('.admin-key', sheet).value.trim();
    if (k !== store.settings.adminKey) store.saveSettings({ adminKey: k });
    return k;
  };
  async function adminCall(path, body) {
    const key = adminKey();
    if (!key) throw new Error('Informe a chave de administrador');
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  }

  function renderBrejos() {
    const pos = geo.pos;
    $('.brejo-list', sheet).innerHTML = store.brejos.length ? store.brejos.map((b) => `
      <div class="card list-item"><div class="grow"><div class="t">${esc(b.name)}</div><div class="s">raio ${Math.round(b.radius)} m${pos ? ` · a ${fmtDist(distanceM(pos, b))}` : ''}</div></div>
      <button class="btn small ghost" data-go="${b.id}">Ir</button><button class="icon-btn" style="width:40px;height:40px" data-del="${b.id}" aria-label="Remover">${icons.close}</button></div>`).join('')
      : '<div class="card list-item"><div class="s">Nenhum brejo cadastrado. Crie um abaixo.</div></div>';
  }

  function renderQueue() {
    $('.qn', sheet).textContent = `(${store.outbox.length})`;
    $('.opq', sheet).innerHTML = store.outbox.length
      ? store.outbox.slice(0, 30).map((o) => `<div><span>${esc(o.type)}</span><span>${o.opId.slice(0, 8)}</span><span>${o.attempts || 0} tent.</span></div>`).join('')
      : '<div><span>Fila vazia: tudo sincronizado ✅</span></div>';
  }

  const logLine = (e) => `<div><time>${fmtTime(e.at)}:${String(new Date(e.at).getSeconds()).padStart(2, '0')}</time><span class="${e.kind}">${esc(e.message)}</span></div>`;
  async function renderLog() {
    const all = await db.logAll();
    const box = $('.logbox', sheet);
    box.innerHTML = all.slice(-60).reverse().map(logLine).join('') || '<div>Nenhum evento ainda.</div>';
  }
  const onLog = (e) => {
    const box = $('.logbox', sheet);
    if (!box) return;
    box.insertAdjacentHTML('afterbegin', logLine(e.detail));
    renderQueue();
  };
  store.addEventListener('log', onLog);

  renderBrejos(); renderQueue(); renderLog();

  sheet.addEventListener('click', async (e) => {
    const tog = e.target.closest('[data-tog]')?.dataset.tog;
    const act = e.target.closest('[data-act]')?.dataset.act;
    const go = e.target.closest('[data-go]')?.dataset.go;
    const del = e.target.closest('[data-del]')?.dataset.del;
    try {
      if (tog === 'offline') {
        await store.saveSettings({ forcedOffline: !store.settings.forcedOffline });
        $('[data-tog=offline] .switch', sheet).classList.toggle('on', store.settings.forcedOffline);
        store.log(store.settings.forcedOffline ? 'warn' : 'info', store.settings.forcedOffline ? 'Modo avião simulado ATIVADO' : 'Modo avião simulado desativado');
        sync.kick(0);
      }
      if (tog === 'sim') {
        await geo.setMode(geo.mode === 'sim' ? 'real' : 'sim');
        $('[data-tog=sim] .switch', sheet).classList.toggle('on', geo.mode === 'sim');
        if (geo.mode === 'sim' && !geo.pos && store.brejos[0]) geo.teleport(store.brejos[0].lat - 0.0005, store.brejos[0].lng);
        ctx.refresh();
      }
      if (act === 'outage') { await adminCall('/api/admin/outage', { seconds: 60 }); store.log('warn', 'Servidor derrubado por 60 s (simulação)'); sync.kick(0); toast('Servidor fora do ar por 60 s. Continue jogando!', 'warn', 'cloudOff'); }
      if (act === 'restore') { await adminCall('/api/admin/outage', { seconds: 0 }); store.log('ok', 'Servidor religado'); sync.kick(0); toast('Servidor de volta!', 'ok', 'check'); }
      if (act === 'drop') { sync.dropNextResponse = true; store.log('warn', 'A resposta da próxima sincronização com operações será "perdida"'); toast('Agora capture uma perereca: o servidor grava, mas a resposta se perde.', '', 'sync', 4500); }
      if (act === 'resend') { const r = await sync.resendLast(); toast(r.status === 'duplicate' ? 'Servidor reconheceu a operação repetida e não mudou nada ✅' : `Resposta: ${r.status}`, 'ok', 'check', 4000); }
      if (act === 'shake') { closeSheet(); sensors.simulateShake(); }
      if (act === 'perm') { const ok = await sensors.request(); toast(ok ? 'Sensores liberados!' : 'Permissão negada', ok ? 'ok' : 'warn'); }
      if (act === 'create') {
        if (!geo.pos) throw new Error('Ainda sem posição: ative o GPS ou o GPS simulado');
        const name = $('.brejo-name', sheet).value.trim();
        const radius = Number($('.brejo-radius', sheet).value) || 35;
        if (!name) throw new Error('Dê um nome ao brejo');
        const r = await adminCall('/api/admin/brejos', { name, lat: geo.pos.lat, lng: geo.pos.lng, radius });
        await store.setBrejos(r.brejos, r.version, r.campus);
        $('.brejo-name', sheet).value = '';
        renderBrejos();
        toast(`Brejo "${esc(name)}" criado aqui!`, 'ok', 'check');
        ctx.refresh();
      }
      if (act === 'campus') {
        if (!geo.pos) throw new Error('Ainda sem posição: ative o GPS ou o GPS simulado');
        const radius = Number($('.campus-radius', sheet).value) || 500;
        const r = await adminCall('/api/admin/campus', { lat: geo.pos.lat, lng: geo.pos.lng, radius });
        await store.setBrejos(r.brejos, r.version, r.campus);
        toast(`Campus definido aqui (raio ${radius} m): lagoinhas espalhadas!`, 'ok', 'check');
        ctx.refresh();
      }
      if (go) {
        const b = store.brejos.find((x) => x.id === go);
        if (geo.mode !== 'sim') await geo.setMode('sim');
        $('[data-tog=sim] .switch', sheet).classList.add('on');
        geo.teleport(b.lat - (b.radius + 15) / 111320, b.lng);
        closeSheet();
        ctx.showMap(true);
      }
      if (del) {
        const r = await adminCall('/api/admin/brejos/remove', { id: del });
        await store.setBrejos(r.brejos, r.version, r.campus);
        renderBrejos();
        ctx.refresh();
      }
    } catch (err) {
      toast(err.kind === 'offline' ? 'Sem conexão com o servidor' : err.message, 'warn');
    }
  });
}
