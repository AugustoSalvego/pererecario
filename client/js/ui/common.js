import { icons } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- toast ----------
// Aviso em balão no meio da tela para quem tenta seguir sem marcar "Li e concordo":
// mensagem, links para os termos, botão OK embaixo e X no canto. Ao fechar, a caixinha treme.
export function termsAlert(card, { what = 'criar a sua conta' } = {}) {
  document.querySelector('.alert-root')?.remove();
  const root = h(`<div class="alert-root">
    <div class="alert-backdrop"></div>
    <div class="alert-box" role="alertdialog" aria-modal="true" aria-labelledby="alert-t" aria-describedby="alert-m">
      <button type="button" class="alert-x" aria-label="Fechar">${icons.close}</button>
      <div class="alert-ico">📄</div>
      <h3 id="alert-t">Falta aceitar os termos</h3>
      <p id="alert-m">Para ${esc(what)}, você precisa ler e concordar com os <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a> do Pererecário.</p>
      <p class="alert-hint">Marque a caixinha <b>"Li e concordo"</b> e toque no botão de novo.</p>
      <button type="button" class="btn alert-ok">OK</button>
    </div>
  </div>`);
  document.body.appendChild(root);
  let closed = false;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    root.classList.add('out');
    setTimeout(() => root.remove(), 200);
    const box = card?.querySelector('.terms-check');
    if (!box) return;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }
  document.addEventListener('keydown', onKey);
  root.querySelector('.alert-x').addEventListener('click', close);
  root.querySelector('.alert-ok').addEventListener('click', close);
  root.querySelector('.alert-backdrop').addEventListener('click', close);
  setTimeout(() => root.querySelector('.alert-ok')?.focus({ preventScroll: true }), 60);
}

export function toast(msg, kind = '', icon = null, ms = 3200) {
  const root = $('#toasts');
  // o mesmo aviso de novo (ex.: tocou 3 vezes) não empilha: troca o antigo pelo novo
  const key = `${kind}|${msg}`;
  for (const old of [...root.children]) if (old.dataset.key === key) old.remove();
  const el = h(`<div class="toast ${kind}">${icon ? icons[icon] : ''}<span>${msg}</span></div>`);
  el.dataset.key = key;
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

// Troca o conteúdo só se ele mudou de verdade. As telas são redesenhadas a cada mudança do jogo
// (inclusive a cada passo do boneco); reescrever o mesmo HTML reinicia as animações de entrada e
// faz a lista "piscar".
export function setHtml(el, html) {
  if (!el || el.__html === html) return false;
  el.innerHTML = html;
  el.__html = html;
  return true;
}

// ---------- bottom sheet ----------
let sheetClose = null;
export function openSheet(html, { onClose, cls = '' } = {}) {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${cls}"><div class="grabber"></div>${html}</div>`;
  const sheet = $('.sheet', root);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  $('.sheet-backdrop', root).addEventListener('click', () => closeSheet());
  // arrastar para baixo para fechar
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { if (sheet.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    sheet.style.transform = '';
    if (dy > 110) closeSheet();
  });
  sheetClose = onClose || null;
  return sheet;
}

export function closeSheet(immediate = false) {
  const root = $('#sheet-root');
  if (!root.children.length) return;
  const cb = sheetClose;
  sheetClose = null;
  root.classList.remove('open');
  if (immediate) root.innerHTML = '';
  else setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; }, 320);
  cb?.();
}

// ---------- formatação ----------
export const fmtDate = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
export const fmtTime = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (t) => `${fmtDate(t)} às ${fmtTime(t)}`;
export const fmtDist = (m) => (!Number.isFinite(m) ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`);
export const fmtCm = (cm) => `${String(cm).replace('.', ',')} cm`;
export function fmtDuration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
export function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'agora';
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${Math.round(s / 3600)} h`;
}
