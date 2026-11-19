import { api } from '../api.js';
import { store } from '../store.js';
import { frogImg } from '../catalog.js';
import { icons } from './icons.js';
import { img } from './sprites.js';
import { $, h, toast } from './common.js';
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

export function renderLogin(onDone, config = {}) {
  const root = $('#login');
  root.classList.remove('hidden');
  root.innerHTML = '';
  const el = h(`<div style="position:absolute;inset:0;display:flex;flex-direction:column">
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
      <div class="offline-banner hidden">${icons.cloudOff}<span>Você está sem internet. Para entrar pela primeira vez é preciso estar online.</span></div>
      <div class="google-area hidden"><div class="g-slot"></div><div class="or"><span>ou com e-mail</span></div></div>
      <div class="segmented"><button type="button" data-mode="login" class="on">Entrar</button><button type="button" data-mode="register">Criar conta</button></div>
      <label class="field reg-only hidden">${icons.sparkle}<input name="displayName" autocomplete="nickname" placeholder="Seu apelido no jogo" maxlength="24"></label>
      <label class="field">${icons.mail}<input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="Seu e-mail (Gmail)" maxlength="254"></label>
      <label class="field pw">${icons.key}<input name="password" type="password" autocomplete="current-password" placeholder="Senha"><button type="button" class="eye" aria-label="Mostrar senha">${icons.eye}</button></label>
      <div class="pw-hint reg-only hidden">Mínimo de 8 caracteres.</div>
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
  </div>`);
  root.appendChild(el);

  const form = $('form', el);
  const err = $('.form-error', form);
  const submit = $('button[type=submit]', el);
  const banner = $('.offline-banner', el);
  const gArea = $('.google-area', el);
  const nickCard = $('.nick-card', el);
  let mode = 'login';
  let clientId = null;

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
    sfx.win();
    root.classList.add('hidden');
    root.innerHTML = '';
    onDone(isNew);
    if (r.passwordReset) toast('Sua conta agora entra com o Google. Para entrar também com senha, crie uma nova em Perfil → Conta.', 'ok', 'key', 7000);
    else if (r.linked) toast('Sua conta foi ligada ao Google.', 'ok', 'check', 3500);
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
        form.classList.add('hidden');
        nickCard.classList.remove('hidden');
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
    nickCard.classList.add('hidden');
    form.classList.remove('hidden');
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
  $('.eye', form).addEventListener('click', (e) => {
    const inp = form.password;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = show ? icons.eyeOff : icons.eye;
    e.currentTarget.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
  });

  el.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    sfx.tap();
    el.querySelectorAll('.segmented button').forEach((x) => x.classList.toggle('on', x === b));
    el.querySelectorAll('.reg-only').forEach((x) => x.classList.toggle('hidden', mode !== 'register'));
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
      const r = mode === 'register'
        ? await api.post('/api/auth/register', { displayName, email, password }, AUTH_WAIT)
        : await api.post('/api/auth/login', { email, password }, AUTH_WAIT);   // contas antigas: aceita o usuário no lugar do e-mail
      await enter(r, mode === 'register');
    } catch (ex) {
      err.textContent = ex.kind === 'offline' ? 'Sem internet. Conecte-se para entrar.' : ex.message;
      sfx.error();
    } finally {
      done();
      submit.disabled = false;
      submit.textContent = mode === 'register' ? 'Criar minha conta' : 'Entrar no brejo';
    }
  });
}
