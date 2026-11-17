// Sons sintetizados na hora (Web Audio): nenhum arquivo de áudio para baixar.
let ctx = null;
const ac = () => {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

export function unlockAudio() { ac(); }

function tone({ type = 'sine', from, to, dur, gain = 0.15, delay = 0, filter }) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function croak(delay = 0) {
  // "rrribbit": dois pulsos graves com modulação rápida
  const c = ac();
  if (!c) return;
  for (const [d, f] of [[0, 210], [0.17, 170]]) {
    const t0 = c.currentTime + delay + d;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const g = c.createGain();
    const filt = c.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + 0.14);
    lfo.frequency.value = 38;
    lfoGain.gain.value = 0.09;
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
    lfo.connect(lfoGain).connect(g.gain);
    o.connect(filt).connect(g).connect(c.destination);
    o.start(t0); lfo.start(t0);
    o.stop(t0 + 0.17); lfo.stop(t0 + 0.17);
  }
}

export const sfx = {
  tap: () => tone({ from: 660, to: 990, dur: 0.08, gain: 0.08 }),
  hit: () => { tone({ from: 520, to: 1040, dur: 0.12, gain: 0.12 }); tone({ type: 'triangle', from: 1040, to: 1300, dur: 0.1, gain: 0.06, delay: 0.05 }); },
  splash: () => tone({ type: 'triangle', from: 420, to: 140, dur: 0.18, gain: 0.08, filter: 1200 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, to: f * 1.01, dur: 0.22, gain: 0.1, delay: i * 0.09 })),
  error: () => tone({ type: 'square', from: 220, to: 160, dur: 0.18, gain: 0.05, filter: 800 }),
  croak,
};

export const vibrate = (p) => { try { navigator.vibrate?.(p); } catch {} };
