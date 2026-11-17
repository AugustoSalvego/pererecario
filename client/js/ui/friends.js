// Amigos: interação entre jogadores por QR code (computação ubíqua por proximidade).
// Escanear o QR de alguém (pessoalmente) cria a amizade e solta uma perereca-presente.
import { getCatalog, frogImg, species } from '../catalog.js';
import { store } from '../store.js';
import { api } from '../api.js';
import { giftFor, dayOf, maskFromSpecies } from '../shared/game.js';
import { icons } from './icons.js';
import { $, h, esc, openSheet, closeSheet, toast, fmtDate } from './common.js';
import { sfx, vibrate } from '../audio.js';

const PREFIX = 'PERERECARIO:1:';
let ctx = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function myPayload() {
  const v = store.view;
  const mask = maskFromSpecies(getCatalog(), [...v.discovered]);
  return `${PREFIX}${v.player.id}:${mask}:${v.player.avatar || 'frog_leaf'}:${encodeURIComponent(v.player.displayName)}`;
}

function parsePayload(text) {
  if (!text || !text.startsWith(PREFIX)) return null;
  const [id, mask, avatar, ...rest] = text.slice(PREFIX.length).split(':');
  if (!id) return null;
  return { id, mask: Number(mask) >>> 0, avatar: species(avatar) ? avatar : 'frog_leaf', displayName: decodeURIComponent(rest.join(':') || 'Amigo') };
}

export function mountFriends(el, context) {
  ctx = context;
  el.innerHTML = `<div class="screen-head head-friends">
      <h2>Amigos</h2><p>Encontrou outro jogador? Escaneiem o QR um do outro!</p>
    </div>
    <div class="screen-body">
      <div class="card qr-card">
        <div class="qr-box"><div class="qr-svg"></div><div class="qr-frog"></div></div>
        <div class="code-pill"></div>
        <div style="font-size:14px;color:var(--ink-soft);font-weight:500;margin-bottom:14px">Mostre seu QR para um amigo escanear</div>
        <button class="btn block" data-act="scan" style="--c:#8f5ee0;--d:#6a3fc0">${icons.scan} Escanear QR de amigo</button>
        <div class="inline-input" style="margin-top:12px"><input placeholder="ou digite o código" maxlength="8" autocapitalize="characters" spellcheck="false"><button class="btn small ghost" data-act="code">OK</button></div>
      </div>
      <div class="section-title">Parceiros de brejo <small class="nfriends"></small></div>
      <div class="list friend-list"></div>
    </div>`;
  $('[data-act=scan]', el).addEventListener('click', () => { sfx.tap(); openScanner(); });
  $('[data-act=code]', el).addEventListener('click', () => byCode($('.inline-input input', el)));
  $('.inline-input input', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') byCode(e.target); });
}

export async function renderFriends(el) {
  const v = store.view;
  if (!v.player) return;
  $('.code-pill', el).textContent = v.player.friendCode || '······';
  $('.qr-frog', el).innerHTML = frogImg(v.player.avatar || 'frog_leaf', 44);
  try {
    await loadScript('vendor/qrcode.js');
    const qr = window.qrcode(0, 'M');
    qr.addData(myPayload());
    qr.make();
    $('.qr-svg', el).innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch { $('.qr-svg', el).textContent = 'QR indisponível'; }

  const day = dayOf(store.now());
  $('.nfriends', el).textContent = v.friends.length ? `${v.friends.length}` : '';
  $('.friend-list', el).innerHTML = v.friends.length ? v.friends.map((f) => {
    const giftTaken = v.capturedSpawns.has(`gift:${v.player.id}:${f.id}:${day}`);
    return `<div class="card list-item">
      <div class="avatar">${frogImg(f.avatar || 'frog_leaf', 34)}</div>
      <div class="grow"><div class="t">${esc(f.displayName)}${f.pending ? ' <small style="color:var(--water-dark)">☁️</small>' : ''}</div>
      <div class="s">${giftTaken ? '🎁 Presente de hoje já recebido' : 'Escaneie o QR de novo para o presente de hoje'}</div></div>
      <div class="s">desde ${fmtDate(f.since)}</div>
    </div>`;
  }).join('') : `<div class="empty">${frogImg('frog_guava', 90)}<h3>Nenhum parceiro ainda</h3><p>Escaneie o QR de outro jogador e ganhe uma perereca-presente!</p></div>`;
}

async function byCode(input) {
  const code = input.value.trim().toUpperCase();
  if (code.length < 4) return;
  try {
    const f = await api.get(`/api/players/code?code=${encodeURIComponent(code)}`);
    input.value = '';
    await handleFriend(f);
  } catch (e) {
    toast(e.kind === 'offline' || e.kind === 'server-down' ? 'O código precisa de internet. Offline, use o QR!' : e.message, 'warn');
  }
}

export async function handleFriend(friend) {
  const v = store.view;
  if (friend.id === v.player.id) { toast('Esse é o seu próprio QR! 😄', 'warn'); return; }
  const isNew = await store.addFriend(friend);
  vibrate(30);
  sfx.pop();
  if (isNew) toast(`Você e ${esc(friend.displayName)} agora são parceiros de brejo!`, 'ok', 'friends');
  const gift = giftFor(v.player.id, friend.id, dayOf(store.now()), friend.mask >>> 0, getCatalog());
  if (store.view.capturedSpawns.has(gift.id)) {
    toast(`Você já pegou o presente de hoje de ${esc(friend.displayName)}. Volte amanhã!`, '', 'clock');
    ctx?.refresh?.();
    return;
  }
  const sheet = openSheet(`
    <div class="stage-lg unknown">${frogImg(gift.speciesId, 150)}</div>
    <h3>🎁 Presente de ${esc(friend.displayName)}!</h3>
    <p class="lead">Uma perereca pulou do QR do seu amigo. Pegue antes que ela fuja para o brejo!</p>
    <button class="btn sun block" data-act="catch">Capturar!</button>
  `);
  $('[data-act=catch]', sheet).addEventListener('click', () => {
    closeSheet(true);
    ctx?.capture({ ...gift, mask: friend.mask >>> 0, friendId: friend.id });
  });
  ctx?.refresh?.();
}

async function openScanner() {
  const app = $('#app');
  const el = h(`<div class="scanner">
    <video playsinline muted></video><div class="frame"></div>
    <div class="scan-top"><button class="icon-btn" data-act="close">${icons.close}</button><b>Escanear amigo</b><span style="width:48px"></span></div>
    <div class="scan-bottom">Aponte para o QR code no celular do seu amigo</div>
  </div>`);
  app.appendChild(el);
  const video = $('video', el);
  let stream = null, timer = null, stopped = false;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    el.remove();
  };
  $('[data-act=close]', el).addEventListener('click', stop);

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    stop();
    toast('Não consegui abrir a câmera. Permita o acesso ou digite o código do amigo.', 'warn', 'scan', 4500);
    return;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});

  let detector = null;
  if ('BarcodeDetector' in window) {
    try { if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch {}
  }
  if (!detector) await loadScript('vendor/jsQR.js').catch(() => {});
  const canvas = document.createElement('canvas');
  const c2d = canvas.getContext('2d', { willReadFrequently: true });

  const tick = async () => {
    if (stopped) return;
    let text = null;
    try {
      if (video.readyState >= 2) {
        if (detector) {
          const codes = await detector.detect(video);
          text = codes[0]?.rawValue || null;
        } else if (window.jsQR) {
          const scale = Math.min(1, 480 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          c2d.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = c2d.getImageData(0, 0, canvas.width, canvas.height);
          text = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
        }
      }
    } catch {}
    const friend = parsePayload(text);
    if (friend) { stop(); handleFriend(friend); return; }
    if (text) $('.scan-bottom', el).textContent = 'Esse QR não é do Pererecário. Tente o QR do perfil do amigo.';
    timer = setTimeout(tick, 220);
  };
  tick();
}
