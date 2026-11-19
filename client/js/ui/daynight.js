// Dia e noite no mapa (computação ciente de contexto): calcula a altura do sol no lugar onde o
// jogador está, na hora atual, e escolhe o céu do mapa. Não depende de internet.
//   sol acima de -4°   -> dia (mapa nas cores normais)
//   abaixo de -4°      -> noite (mapa azulado, luz em volta do boneco e vaga-lumes)
// No painel de demonstração dá para forçar "dia" ou "noite" (store.settings.sky).
import { store } from '../store.js';

const RAD = Math.PI / 180;

// Altura do sol em graus (fórmula aproximada da NOAA / Almanaque Astronômico, erro < 1°).
export function sunElevation(date, lat, lng) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // dias desde J2000
  const g = (357.529 + 0.98560028 * d) % 360;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = q + 1.915 * Math.sin(g * RAD) + 0.02 * Math.sin(2 * g * RAD);
  const e = 23.439 - 0.00000036 * d;
  const ra = Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD;
  const dec = Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD)) / RAD;
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((((gmst * 15 + lng - ra) % 360) + 540) % 360) - 180;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec * RAD) + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(ha * RAD)) / RAD;
}

// era dia ou noite naquele momento e lugar? (sem lugar, usa a hora local)
export function isNightAt(ts, pos) {
  const d = new Date(ts);
  if (!pos) { const h = d.getHours(); return h >= 19 || h < 5; }
  return sunElevation(d, pos.lat, pos.lng) <= -4;
}

export function skyPhase(date, pos) {
  const forced = store.settings.sky;
  if (forced === 'dia') return 'day';
  if (forced === 'noite') return 'night';
  if (!pos) {
    const h = date.getHours();
    return h >= 19 || h < 5 ? 'night' : 'day';
  }
  return sunElevation(date, pos.lat, pos.lng) > -4 ? 'day' : 'night';
}
