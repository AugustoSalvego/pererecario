import { api } from '../api.js';
import { store } from '../store.js';
import { frogImg } from '../catalog.js';
import { icons } from './icons.js';
import { img } from './sprites.js';
import { $, h, esc, toast } from './common.js';
import { sfx, unlockAudio } from '../audio.js';

const hills = `
<svg class="hills" viewBox="0 0 400 300" preserveAspectRatio="none">
  <path d="M0 40 C 70 0, 140 25, 200 12 S 330 -10, 400 30 V300 H0Z" fill="#8fd16f"/>
  <path d="M0 80 C 90 40, 170 70, 240 50 S 350 35, 400 60 V300 H0Z" fill="#6cbf55"/>
  <path d="M0 120 C 100 95, 300 95, 400 115 V300 H0Z" fill="#58b04a"/>
  <g fill="#2f8a32">
    <path d="M14 150 q6 -60 2 -100 q8 44 6 100z"/><path d="M30 155 q10 -50 14 -84 q-2 44 -6 84z"/>
    <path d="M372 150 q-6 -66 0 -110 q2 50 8 110z"/><path d="M386 158 q6 -44 12 -74 q-4 40 -4 74z"/>
  </g>
  <g fill="#a6763b"><ellipse cx="18" cy="52" rx="4" ry="12"/><ellipse cx="375" cy="42" rx="4" ry="12"/></g>
</svg>`;

// ---------- "Continuar com Google" ----------
// O botão é o oficial do Google (Google Identity Services). Ele entrega um "ID token", que o
// servidor confere antes de abrir a conta (server/google.js). Sem Client ID no servidor, o botão
// simplesmente não aparece e vale só e-mail e senha.
let gisPromise = null;
export function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.async = true;
      sc.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('Google indisponível')));
      sc.onerror = () => { gisPromise = null; reject(new Error('Não foi possível carregar o login do Google')); };
      document.head.appendChild(sc);
    });
  }
  return gisPromise;
}

// desenha o botão oficial dentro de `slot`; onCredential recebe o token
export async function renderGoogleButton(slot, clientId, onCredential) {
  const g = await loadGoogle();
  g.accounts.id.initialize({ client_id: clientId, callback: (resp) => onCredential(resp.credential), ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true });
  slot.innerHTML = '';
  g.accounts.id.renderButton(slot, {
    type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill',
    logo_alignment: 'center', locale: 'pt-BR', width: Math.max(200, Math.min(400, Math.round(slot.clientWidth || 300))),
  });
}

// O servidor gratuito "dorme" e leva até ~1 min para acordar: o login espera e avisa.
const AUTH_WAIT = { timeout: 70000 };
function slowHint(btn, idle) {
  const t = setTimeout(() => { if (btn) btn.textContent = 'Acordando o servidor… (até 1 min)'; }, 4000);
  return () => { clearTimeout(t); if (btn && idle) btn.textContent = idle; };
}

async function googleClientId(config) {
  if (config?.googleClientId) return config.googleClientId;
  // o servidor gratuito pode estar acordando: pergunta de novo com mais paciência
  try { const c = await api.get('/api/config', { timeout: 60000 }); return c?.googleClientId || null; } catch { return null; }
}

// A sessão expirou com coisas ainda na fila: avisa para entrar com a mesma conta (assim nada se perde)
function pendingNote() {
  const n = store.outbox.length;
  const who = store.snapshot?.player;
  if (!n || !who) return '';
  return `<div class="pending-note">${icons.cloudOff}<span>Este aparelho tem <b>${n} ${n === 1 ? 'ação' : 'ações'}</b> da conta <b>${esc(who.displayName || '')}</b>${who.email ? ` (${esc(who.email)})` : ''} esperando para subir. Entre com essa mesma conta para não perder nada.</span></div>`;
}

export function renderLogin(onDone, config = {}) {
  const root = $('#login');
  root.classList.remove('hidden');
  root.innerHTML = '';
  const el = h(`<div class="login-wrap">
    <div class="scene">
      <div class="sun"></div>
      <div class="cloud" style="top:12%;width:90px;animation-delay:-8s"></div>
      <div class="cloud" style="top:22%;width:70px;animation-delay:-24s;animation-duration:52s"></div>
      ${hills}
      <div class="firefly" style="left:20%;top:30%"></div>
      <div class="firefly" style="left:70%;top:26%;animation-delay:-2s"></div>
      <div class="firefly" style="left:52%;top:40%;animation-delay:-4s"></div>
    </div>
    <div class="login-top">
      <h1 class="logo">Pererecário<small>caça às pererecas</small></h1>
      <span class="tagline">🐸 Ande por aí e capture todas!</span>
    </div>
    <div class="login-stage">
      ${img('pond-big.png', 380, 'pond-img')}
      <div class="lily-frog" style="left:20%;bottom:24%">${frogImg('frog_drop', 54)}${img('lilypad.png', 60, 'pad-img')}</div>
      <div class="lily-frog" style="left:50%;bottom:9%;transform:translateX(-50%)">${frogImg('frog_pitanga', 80)}${img('lilypad.png', 88, 'pad-img')}</div>
      <div class="lily-frog" style="right:22%;bottom:30%">${frogImg('frog_honey', 46)}${img('lilypad.png', 52, 'pad-img')}</div>
    </div>
    <form class="login-card" novalidate>
      ${pendingNote()}
      <div class="offline-banner hidden">${icons.cloudOff}<span>Você está sem internet. Para entrar pela primeira vez é preciso estar online.</span></div>
      <div class="google-area hidden"><div class="g-slot"></div><div class="or"><span>ou com e-mail</span></div></div>
      <div class="segmented"><button type="button" data-mode="login" class="on">Entrar</button><button type="button" data-mode="register">Criar conta</button></div>
      <label class="field reg-only hidden">${icons.sparkle}<input name="displayName" autocomplete="nickname" placeholder="Seu apelido no jogo" maxlength="24"></label>
      <label class="field">${icons.mail}<input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="Seu e-mail (Gmail)" maxlength="254"></label>
      <label class="field pw">${icons.key}<input name="password" type="password" autocomplete="current-password" placeholder="Senha"><button type="button" class="eye" aria-label="Mostrar senha">${icons.eye}</button></label>
      <div class="pw-hint reg-only hidden">Mínimo de 8 caracteres.</div>
      <div class="forgot-row login-only"><button type="button" class="link-btn" data-act="forgot">Esqueci a senha</button></div>
      <div class="form-error"></div>
      <button class="btn block" type="submit">Entrar no brejo</button>
      <div class="login-note">Seu progresso fica salvo no celular e no servidor.</div>
    </form>
    <div class="login-card nick-card hidden">
      <h3>Quase lá! 🐸</h3>
      <p class="nick-lead">Como você quer ser chamado no jogo? É o nome que aparece no mapa e no ranking.</p>
      <label class="field">${icons.sparkle}<input name="nick" autocomplete="nickname" placeholder="Seu apelido" maxlength="24"></label>
      <div class="form-error nick-error"></div>
      <button class="btn block" type="button" data-act="nick-ok">Começar a caçar</button>
      <button class="btn ghost block" type="button" data-act="nick-back" style="margin-top:8px">Voltar</button>
    </div>
    <div class="login-card forgot-card hidden">
      <h3>Esqueci a senha 🔑</h3>
      <p class="nick-lead">Digite o e-mail da sua conta. Vou mandar um código de 6 números para você criar uma senha nova. Seu progresso continua todo lá.</p>
      <label class="field">${icons.mail}<input name="femail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="Seu e-mail" maxlength="254" enterkeyhint="send"></label>
      <div class="form-error forgot-error"></div>
      <button class="btn block" type="button" data-act="forgot-ok">Mandar o código</button>
      <button class="btn ghost block" type="button" data-act="forgot-back" style="margin-top:8px">Voltar</button>
    </div>
    <div class="login-card code-card hidden">
      <div class="code-head"><span class="code-ico">${icons.mail}</span><div><h3 class="code-title">Confira seu e-mail</h3><p class="code-lead"></p></div></div>
      <label class="otp">
        <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" aria-label="Código de 6 números" enterkeyhint="done">
        <span class="otp-box"></span><span class="otp-box"></span><span class="otp-box"></span><span class="otp-box"></span><span class="otp-box"></span><span class="otp-box"></span>
      </label>
      <label class="field pw reset-only hidden">${icons.key}<input name="newpass" type="password" autocomplete="new-password" placeholder="Senha nova (8 ou mais)" maxlength="128" enterkeyhint="done"><button type="button" class="eye" aria-label="Mostrar senha">${icons.eye}</button></label>
      <div class="form-error code-error"></div>
      <button class="btn block" type="button" data-act="code-ok">Confirmar</button>
      <p class="code-help">Não chegou em 1 minuto? Olhe no <b>spam</b> ou em <b>lixo eletrônico</b>. O código vale por 15 minutos.</p>
      <div class="code-links"><button type="button" class="link-btn" data-act="code-resend">Mandar de novo</button><button type="button" class="link-btn" data-act="code-back">Trocar o e-mail</button></div>
    </div>
  </div>`);
  root.appendChild(el);

  const form = $('form', el);
  const err = $('.form-error', form);
  const submit = $('button[type=submit]', el);
  const banner = $('.offline-banner', el);
  const gArea = $('.google-area', el);
  const nickCard = $('.nick-card', el);
  const forgotCard = $('.forgot-card', el);
  const codeCard = $('.code-card', el);
  let mode = 'login';
  let clientId = null;

  // um cartão por vez: e-mail e senha, apelido (Google), esqueci a senha, código do e-mail
  function showCard(card) {
    for (const c of [form, nickCard, forgotCard, codeCard]) c.classList.toggle('hidden', c !== card);
    card.style.animation = 'none';
    void card.offsetHeight;          // recomeça a animação de "subir"
    card.style.animation = '';
  }

  const refreshOnline = () => {
    const off = api.isOffline();
    banner.classList.toggle('hidden', !off);
    gArea.classList.toggle('hidden', off || !clientId);
  };
  refreshOnline();
  window.addEventListener('online', refreshOnline);
  window.addEventListener('offline', refreshOnline);

  // entrou (qualquer jeito): guarda a sessão, traz o progresso do servidor e abre o jogo
  async function enter(r, isNew) {
    await store.login(r);
    try {
      const sentAt = Date.now();
      const resp = await api.post('/api/sync', { deviceId: store.deviceId, ops: [], brejosVersion: store.brejosVersion });
      await store.applySync(resp, [], sentAt, Date.now());
      if (resp.state.captures.length) store.log('ok', `Progresso recuperado do servidor: ${resp.state.captures.length} capturas`);
    } catch {}
    window.removeEventListener('online', refreshOnline);
    window.removeEventListener('offline', refreshOnline);
    clearInterval(countdown);
    sfx.win();
    root.classList.add('hidden');
    root.innerHTML = '';
    onDone(isNew);
    if (r.passwordReset) toast('Sua conta agora entra com o Google. Para entrar também com senha, crie uma nova em Perfil → Conta.', 'ok', 'key', 7000);
    else if (r.linked) toast('Sua conta foi ligada ao Google.', 'ok', 'check', 3500);
    else if (r.passwordChanged) toast('Senha nova salva! Bem-vindo de volta ao brejo.', 'ok', 'key', 4000);
  }

  // ----- Google -----
  let pendingCredential = null;
  async function onGoogle(credential) {
    unlockAudio();
    err.textContent = '';
    gArea.classList.add('busy');
    const done = slowHint(submit, submit.textContent);
    try {
      const r = await api.post('/api/auth/google', { credential }, AUTH_WAIT);
      if (r.needsNickname) {
        pendingCredential = credential;
        showCard(nickCard);
        const inp = $('input[name=nick]', nickCard);
        inp.value = r.suggestion || '';
        setTimeout(() => inp.focus(), 50);
        sfx.pop();
        return;
      }
      await enter(r, !!r.created);
    } catch (ex) {
      err.textContent = ex.kind === 'offline' ? 'Sem internet. Conecte-se para entrar.' : ex.message;
      sfx.error();
    } finally { gArea.classList.remove('busy'); done(); }
  }
  $('[data-act=nick-ok]', nickCard).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const nick = $('input[name=nick]', nickCard).value.trim();
    const nerr = $('.nick-error', nickCard);
    if (nick.length < 2) { nerr.textContent = 'O apelido precisa de pelo menos 2 letras.'; sfx.error(); return; }
    btn.disabled = true;
    btn.textContent = 'Um instante…';
    try {
      const r = await api.post('/api/auth/google', { credential: pendingCredential, displayName: nick }, AUTH_WAIT);
      await enter(r, true);
    } catch (ex) {
      nerr.textContent = ex.status === 401 ? 'O login do Google expirou. Volte e toque em "Continuar com Google" de novo.' : ex.message;
      sfx.error();
      btn.disabled = false;
      btn.textContent = 'Começar a caçar';
    }
  });
  $('[data-act=nick-back]', nickCard).addEventListener('click', () => {
    pendingCredential = null;
    showCard(form);
  });
  googleClientId(config).then(async (id) => {
    clientId = id;
    if (!id) return;
    try {
      await renderGoogleButton($('.g-slot', el), id, onGoogle);
      refreshOnline();
    } catch { /* sem o Google (bloqueado ou sem internet): fica só e-mail e senha */ }
  });

  // ----- e-mail e senha -----
  el.querySelectorAll('.eye').forEach((eye) => eye.addEventListener('click', () => {
    const inp = eye.parentElement.querySelector('input');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    eye.innerHTML = show ? icons.eyeOff : icons.eye;
    eye.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
  }));

  // ----- código de 6 números (confirmar o cadastro ou criar senha nova) -----
  const otp = $('input[name=code]', codeCard);
  const boxes = [...codeCard.querySelectorAll('.otp-box')];
  const newPass = $('input[name=newpass]', codeCard);
  const codeErr = $('.code-error', codeCard);
  const okBtn = $('[data-act=code-ok]', codeCard);
  const resendBtn = $('[data-act=code-resend]', codeCard);
  const backBtn = $('[data-act=code-back]', codeCard);
  let flow = null;      // { purpose, ticket, email, start, key, dead }
  let parked = null;    // pedido de cadastro guardado ao tocar "Trocar o e-mail"
  let countdown = null;
  let busy = false;
  const okLabel = () => (flow?.purpose === 'reset' ? 'Trocar a senha e entrar' : 'Confirmar e entrar');

  function paintOtp() {
    const v = otp.value;
    const focused = document.activeElement === otp;
    boxes.forEach((b, i) => {
      b.textContent = v[i] || '';
      b.classList.toggle('filled', !!v[i]);
      b.classList.toggle('cur', focused && v.length < 6 && i === v.length);
    });
  }
  function codeError(msg) {
    codeErr.textContent = msg;
    okBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    codeCard.classList.remove('bad');
    void codeCard.offsetWidth;
    codeCard.classList.add('bad');
    sfx.error();
  }
  function startCountdown(seconds) {
    clearInterval(countdown);
    let left = Math.max(0, Math.round(seconds || 0));
    const paint = () => {
      resendBtn.disabled = left > 0;
      resendBtn.textContent = left > 0 ? `Mandar de novo em ${left}s` : 'Mandar de novo';
    };
    paint();
    if (left > 0) countdown = setInterval(() => { left--; paint(); if (left <= 0) clearInterval(countdown); }, 1000);
  }

  function openCode(purpose, resp, start, key = null) {
    flow = { purpose, ticket: resp.ticket, email: resp.email, start, key, dead: false, sentAt: resp.sentAt ?? Date.now() };
    const signup = purpose === 'signup';
    $('.code-title', codeCard).textContent = signup ? 'Confira seu e-mail' : 'Crie uma senha nova';
    $('.code-lead', codeCard).innerHTML = `Mandei um código de 6 números para <b>${esc(resp.email)}</b>.`;
    codeCard.querySelectorAll('.reset-only').forEach((x) => x.classList.toggle('hidden', signup));
    okBtn.textContent = okLabel();
    backBtn.textContent = signup ? 'Trocar o e-mail' : 'Voltar';
    otp.value = '';
    newPass.value = '';
    codeErr.textContent = '';
    paintOtp();
    startCountdown(resp.resendIn ?? 60);
    showCard(codeCard);
    sfx.pop();
    setTimeout(() => otp.focus(), 80);
  }

  async function submitCode() {
    if (busy || !flow) return;
    const code = otp.value;
    if (flow.dead) { codeError('Esse código não vale mais. Toque em "Mandar de novo" para receber outro.'); return; }
    if (code.length !== 6) { codeError('Digite os 6 números que chegaram no e-mail.'); otp.focus(); return; }
    if (flow.purpose === 'reset' && newPass.value.length < 8) { codeError('A senha nova precisa de pelo menos 8 caracteres.'); newPass.focus(); return; }
    busy = true;
    okBtn.disabled = true;
    okBtn.textContent = 'Conferindo…';
    const done = slowHint(okBtn);
    try {
      const r = flow.purpose === 'signup'
        ? await api.post('/api/auth/register/confirm', { ticket: flow.ticket, code }, AUTH_WAIT)
        : await api.post('/api/auth/reset', { ticket: flow.ticket, code, password: newPass.value }, AUTH_WAIT);
      const isNew = flow.purpose === 'signup';
      flow = null;
      parked = null;
      await enter(r, isNew);
      return;
    } catch (ex) {
      codeError(ex.kind === 'offline' ? 'Sem internet. Conecte-se e tente de novo.' : ex.message);
      if (ex.data?.expired && flow) { flow.dead = true; startCountdown(0); }
      otp.value = '';
      paintOtp();
      if (!flow?.dead) otp.focus();
    } finally {
      busy = false;
      done();
      okBtn.disabled = false;
      okBtn.textContent = okLabel();
    }
  }

  otp.addEventListener('input', () => {
    const v = otp.value.replace(/\D/g, '').slice(0, 6);   // aceita "123 456" colado do e-mail
    if (v !== otp.value) otp.value = v;
    codeErr.textContent = '';
    codeCard.classList.remove('bad');
    paintOtp();
    if (v.length < 6) return;
    sfx.tap();
    if (flow?.purpose === 'reset' && newPass.value.length < 8) { newPass.focus(); return; }
    submitCode();
  });
  otp.addEventListener('focus', paintOtp);
  otp.addEventListener('blur', paintOtp);
  otp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitCode(); } });
  newPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitCode(); } });
  okBtn.addEventListener('click', submitCode);

  resendBtn.addEventListener('click', async () => {
    if (!flow || busy) return;
    busy = true;
    resendBtn.disabled = true;
    resendBtn.textContent = 'Mandando…';
    try {
      let r;
      try {
        r = flow.dead ? await flow.start() : await api.post('/api/auth/code/resend', { ticket: flow.ticket }, AUTH_WAIT);
      } catch (ex) {
        if (!ex.data?.expired) throw ex;
        r = await flow.start();       // o pedido venceu: começa outro com os mesmos dados
      }
      if (r.token) { flow = null; await enter(r, true); return; }
      flow.ticket = r.ticket;
      flow.dead = false;
      flow.sentAt = Date.now();
      otp.value = '';
      codeErr.textContent = '';
      paintOtp();
      startCountdown(r.resendIn ?? 60);
      toast(`Código novo enviado para ${r.email}`, 'ok', 'mail', 3000);
      sfx.pop();
      otp.focus();
    } catch (ex) {
      codeError(ex.kind === 'offline' ? 'Sem internet. Conecte-se e tente de novo.' : ex.message);
      startCountdown(ex.data?.resendIn || 0);
    } finally { busy = false; }
  });

  backBtn.addEventListener('click', () => {
    clearInterval(countdown);
    if (flow?.purpose === 'signup') {
      parked = flow.dead ? null : flow;
      flow = null;
      showCard(form);
      setTimeout(() => form.email.focus(), 80);
    } else {
      flow = null;
      showCard(forgotCard);
    }
  });

  // ----- esqueci a senha -----
  const fEmail = $('input[name=femail]', forgotCard);
  const fErr = $('.forgot-error', forgotCard);
  const fBtn = $('[data-act=forgot-ok]', forgotCard);
  $('[data-act=forgot]', form).addEventListener('click', () => {
    sfx.tap();
    fEmail.value = form.email.value.trim();
    fErr.textContent = '';
    showCard(forgotCard);
    setTimeout(() => fEmail.focus(), 80);
  });
  $('[data-act=forgot-back]', forgotCard).addEventListener('click', () => {
    if (fEmail.value.trim()) form.email.value = fEmail.value.trim();
    showCard(form);
  });
  async function sendForgot() {
    const email = fEmail.value.trim();
    fErr.textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { fErr.textContent = 'Digite o e-mail da sua conta.'; sfx.error(); return; }
    fBtn.disabled = true;
    fBtn.textContent = 'Mandando…';
    const done = slowHint(fBtn);
    try {
      const start = () => api.post('/api/auth/forgot', { email }, AUTH_WAIT);
      openCode('reset', await start(), start);
    } catch (ex) {
      fErr.textContent = ex.kind === 'offline' ? 'Sem internet. Conecte-se e tente de novo.' : ex.message;
      sfx.error();
    } finally { done(); fBtn.disabled = false; fBtn.textContent = 'Mandar o código'; }
  }
  fBtn.addEventListener('click', sendForgot);
  fEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendForgot(); } });

  el.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    sfx.tap();
    el.querySelectorAll('.segmented button').forEach((x) => x.classList.toggle('on', x === b));
    el.querySelectorAll('.reg-only').forEach((x) => x.classList.toggle('hidden', mode !== 'register'));
    el.querySelectorAll('.login-only').forEach((x) => x.classList.toggle('hidden', mode === 'register'));
    form.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    submit.textContent = mode === 'register' ? 'Criar minha conta' : 'Entrar no brejo';
    err.textContent = '';
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    unlockAudio();
    err.textContent = '';
    const email = form.email.value.trim();
    const password = form.password.value;
    const displayName = form.displayName.value.trim();
    if (!email || !password) { err.textContent = 'Preencha e-mail e senha.'; sfx.error(); return; }
    if (mode === 'register') {
      if (displayName.length < 2) { err.textContent = 'Escolha um apelido (pelo menos 2 letras).'; sfx.error(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Esse e-mail não parece certo.'; sfx.error(); return; }
      if (password.length < 8) { err.textContent = 'A senha precisa de pelo menos 8 caracteres.'; sfx.error(); return; }
    }
    submit.disabled = true;
    submit.textContent = 'Um instante…';
    const done = slowHint(submit);
    try {
      if (mode === 'register') {
        // voltou para corrigir algo e mandou igualzinho: o código que já chegou continua valendo
        const key = `${email.toLowerCase()}\n${displayName}\n${password}`;
        if (parked && parked.key === key) {
          const p = parked;
          parked = null;
          openCode('signup', { ticket: p.ticket, email: p.email, sentAt: p.sentAt, resendIn: 60 - (Date.now() - p.sentAt) / 1000 }, p.start, key);
          return;
        }
        const start = () => api.post('/api/auth/register', { displayName, email, password }, AUTH_WAIT);
        const r = await start();
        // com o e-mail ligado no servidor, a conta só nasce depois do código
        if (r.needsCode) { parked = null; openCode('signup', r, start, key); return; }
        await enter(r, true);
      } else {
        const r = await api.post('/api/auth/login', { email, password }, AUTH_WAIT);   // contas antigas: aceita o usuário no lugar do e-mail
        await enter(r, false);
      }
    } catch (ex) {
      err.textContent = ex.kind === 'offline' ? 'Sem internet. Conecte-se para entrar.' : ex.message;
      sfx.error();
      submit.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } finally {
      done();
      submit.disabled = false;
      submit.textContent = mode === 'register' ? 'Criar minha conta' : 'Entrar no brejo';
    }
  });
}
