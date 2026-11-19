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
// Balãozinho em cima da caixinha "Li e concordo", apontando para ela (some ao marcar ou depois de uns segundos)
export function termsTip(card, text = 'Marque aqui para continuar') {
  const box = card.querySelector('.terms-check');
  if (!box) return;
  box.querySelector('.terms-tip')?.remove();
  const tip = document.createElement('span');
  tip.className = 'terms-tip';
  tip.textContent = text;
  box.appendChild(tip);
  box.classList.remove('shake');
  void box.offsetWidth;
  box.classList.add('shake');
  const input = box.querySelector('input');
  const bye = () => { tip.classList.add('out'); setTimeout(() => tip.remove(), 250); input.removeEventListener('change', bye); };
  input.addEventListener('change', bye);
  setTimeout(bye, 4000);
}

export function toast(msg, kind = '', icon = null, ms = 3200) {
  const root = $('#toasts');
  const el = h(`<div class="toast ${kind}">${icon ? icons[icon] : ''}<span>${msg}</span></div>`);
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
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
export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`);
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
