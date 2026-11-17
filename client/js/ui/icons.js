// Ícones desenhados para o jogo (SVG embutido).
const s = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  map: s('<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/>'),
  book: s('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><circle cx="12" cy="10" r="3"/>'),
  pond: s('<path d="M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2-1.5 4.5-1.5S19 15 21 15"/><path d="M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2-1.5 4.5-1.5S19 19 21 19"/><path d="M8 11c0-3 1.8-6 4-6s4 3 4 6"/><circle cx="10.5" cy="8" r=".6" fill="currentColor"/><circle cx="13.5" cy="8" r=".6" fill="currentColor"/>'),
  friends: s('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.6-.4 4.6 1.2 5 4.3"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.8-4.2 3.7-6.5 7.5-6.5s6.7 2.3 7.5 6.5"/>'),
  locate: s('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: s('<path d="M15 5 8 12l7 7"/>'),
  star: s('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>'),
  cloud: s('<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.3 9.6 4.2 4.2 0 0 0 7 18Z"/>'),
  cloudOff: s('<path d="M7 18h10M17.6 10a6 6 0 0 0-9.4-3M6.3 9.6A4.2 4.2 0 0 0 7 18"/><path d="m3 3 18 18"/>'),
  sync: s('<path d="M20 11a8 8 0 0 0-14.3-4.3L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15"/><path d="M20 20v-5h-5"/>'),
  check: s('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  qr: s('<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v.01M14.5 20.5h.01M17.5 17.5h3v3h-3"/>'),
  scan: s('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4 12h16"/>'),
  phone: s('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  shake: s('<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4 8.5c-1 1-1 6 0 7M20 8.5c1 1 1 6 0 7"/>'),
  wand: s('<path d="m4 20 11-11M14 4v2M19 9h2M17.5 5.5 19 4M12 7l5 5"/>'),
  flag: s('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  trophy: s('<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M9.5 17h5"/>'),
  logout: s('<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
  bug: s('<rect x="7" y="7" width="10" height="12" rx="5"/><path d="M12 7v12M4 11h3M17 11h3M4 17h3M17 17h3M9 4l1.5 2.5M15 4l-1.5 2.5"/>'),
  walk: s('<circle cx="13" cy="4.5" r="2"/><path d="m9 21 2.5-6 2.5 2v4M11.5 15 10 10l4-1.5 2 3.5h3M10 10 7 12v3"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  key: s('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/>'),
  clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  route: s('<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>'),
  sparkle: s('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  sound: s('<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
};

// Bonequinho explorador do jogador (arte original do jogo)
export const explorerSvg = `
<svg viewBox="0 0 64 80" class="explorer" aria-hidden="true">
  <ellipse cx="32" cy="76" rx="15" ry="4" fill="rgba(0,0,0,.22)"/>
  <path d="M22 62h8v12h-9a3 3 0 0 1 1-12Z" fill="#6b4a2e"/>
  <path d="M34 62h8a3 3 0 0 1 1 12h-9V62Z" fill="#6b4a2e"/>
  <rect x="17" y="38" width="30" height="27" rx="11" fill="#3f9d55"/>
  <rect x="12" y="40" width="10" height="20" rx="5" fill="#e0a36b"/>
  <rect x="42" y="40" width="10" height="20" rx="5" fill="#e0a36b"/>
  <path d="M26 40h12l-6 9Z" fill="#fff6dc"/>
  <rect x="21" y="52" width="22" height="5" rx="2.5" fill="#8a5a33"/>
  <circle cx="32" cy="27" r="13" fill="#f1bf8c"/>
  <circle cx="27" cy="28" r="2.1" fill="#2a1f17"/><circle cx="37" cy="28" r="2.1" fill="#2a1f17"/>
  <path d="M28.5 33.5c2 1.6 5 1.6 7 0" stroke="#2a1f17" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <circle cx="24" cy="32" r="2" fill="#f59a8a" opacity=".6"/><circle cx="40" cy="32" r="2" fill="#f59a8a" opacity=".6"/>
  <ellipse cx="32" cy="18" rx="22" ry="5.5" fill="#d6b277"/>
  <path d="M20 18c0-8 5.5-12 12-12s12 4 12 12Z" fill="#e8c88f"/>
  <path d="M20.5 15.5h23" stroke="#7a5a2e" stroke-width="3"/>
  <circle cx="32" cy="18" r="22" fill="none"/>
</svg>`;
