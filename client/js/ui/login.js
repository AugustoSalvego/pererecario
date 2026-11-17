import { api } from '../api.js';
import { store } from '../store.js';
import { frogImg } from '../catalog.js';
import { icons } from './icons.js';
import { img } from './sprites.js';
import { $, h } from './common.js';
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

export function renderLogin(onDone) {
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
      <div class="segmented"><button type="button" data-mode="login" class="on">Entrar</button><button type="button" data-mode="register">Criar conta</button></div>
      <div class="offline-banner hidden">${icons.cloudOff}<span>Você está sem internet. Para entrar pela primeira vez é preciso estar online.</span></div>
      <label class="field reg-only hidden">${icons.sparkle}<input name="displayName" autocomplete="nickname" placeholder="Como quer ser chamado?" maxlength="24"></label>
      <label class="field">${icons.user}<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Usuário" maxlength="20"></label>
      <label class="field">${icons.key}<input name="password" type="password" autocomplete="current-password" placeholder="Senha"></label>
      <div class="form-error"></div>
      <button class="btn block" type="submit">Entrar no brejo</button>
      <div class="login-note">Seu progresso fica salvo no celular e no servidor.</div>
    </form>
  </div>`);
  root.appendChild(el);

  const form = $('form', el);
  const err = $('.form-error', el);
  const submit = $('button[type=submit]', el);
  const banner = $('.offline-banner', el);
  let mode = 'login';

  const refreshOnline = () => banner.classList.toggle('hidden', !api.isOffline());
  refreshOnline();
  window.addEventListener('online', refreshOnline);
  window.addEventListener('offline', refreshOnline);

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
    const body = { username: form.username.value.trim(), password: form.password.value, displayName: form.displayName.value.trim() };
    if (mode === 'register' && !body.displayName) body.displayName = body.username;
    if (!body.username || !body.password) { err.textContent = 'Preencha usuário e senha.'; sfx.error(); return; }
    submit.disabled = true;
    submit.textContent = 'Um instante…';
    try {
      const r = await api.post(mode === 'register' ? '/api/auth/register' : '/api/auth/login', body);
      await store.login(r);
      // primeira sincronização: traz o progresso salvo no servidor (outro aparelho) e os brejos
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
      onDone(mode === 'register');
    } catch (ex) {
      err.textContent = ex.kind === 'offline' ? 'Sem internet. Conecte-se para entrar.' : ex.message;
      sfx.error();
    } finally {
      submit.disabled = false;
      submit.textContent = mode === 'register' ? 'Criar minha conta' : 'Entrar no brejo';
    }
  });
}
