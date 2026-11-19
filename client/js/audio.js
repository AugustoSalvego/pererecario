// Sons sintetizados na hora (Web Audio): nenhum arquivo de áudio para baixar.
let ctx = null;
let noiseBuf = null;
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

// nota curta com envelope suave
function tone({ type = 'sine', from, to = from, dur, gain = 0.12, delay = 0, attack = 0.01, filter }) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
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
  o.stop(t0 + dur + 0.05);
}

// rajada de ruído filtrado (água, folhas)
function noise({ dur, gain = 0.1, delay = 0, type = 'bandpass', freq = 1200, q = 0.8, sweepTo }) {
  const c = ac();
  if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  // toque em botões
  tap: () => tone({ from: 880, to: 1100, dur: 0.06, gain: 0.05 }),
  // escolher uma perereca / perereca aparecendo: "plop" de bolha
  pop: () => {
    tone({ from: 420, to: 980, dur: 0.12, gain: 0.14 });
    tone({ type: 'triangle', from: 1300, dur: 0.07, gain: 0.04, delay: 0.05 });
  },
  // acertar a perereca na captura: "bloop" curtinho e alegre
  hit: () => {
    const base = 520 + Math.random() * 120;
    tone({ from: base, to: base * 1.9, dur: 0.11, gain: 0.13 });
    tone({ type: 'triangle', from: base * 2.5, dur: 0.06, gain: 0.04, delay: 0.04 });
  },
  // errar: respingo na água
  splash: () => noise({ dur: 0.22, gain: 0.07, freq: 1800, sweepTo: 500, q: 0.7 }),
  // matinho mexendo
  rustle: () => {
    noise({ dur: 0.18, gain: 0.06, type: 'highpass', freq: 2500, q: 0.5 });
    noise({ dur: 0.16, gain: 0.05, type: 'highpass', freq: 3000, q: 0.5, delay: 0.14 });
  },
  // captura: arpejo com brilho no final
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.28, gain: 0.09, delay: i * 0.085 }));
    [1568, 2093, 2637].forEach((f, i) => tone({ from: f, dur: 0.18, gain: 0.035, delay: 0.36 + i * 0.06 }));
  },
  // coaxo fofinho ("rib-bit") para o chacoalhar
  ribbit: () => {
    tone({ type: 'triangle', from: 380, to: 300, dur: 0.09, gain: 0.1, filter: 1600 });
    tone({ type: 'triangle', from: 520, to: 430, dur: 0.11, gain: 0.1, delay: 0.13, filter: 1600 });
  },
  error: () => tone({ type: 'triangle', from: 330, to: 260, dur: 0.16, gain: 0.06 }),
  // moedinhas: venda, pagamento ("tlim-tlim")
  coin: () => {
    tone({ type: 'square', from: 988, dur: 0.07, gain: 0.04, filter: 3500 });
    tone({ type: 'square', from: 1319, dur: 0.16, gain: 0.04, delay: 0.07, filter: 3500 });
  },
};
sfx.croak = sfx.ribbit;

export const croak = () => sfx.ribbit();
export const vibrate = (p) => { try { navigator.vibrate?.(p); } catch {} };
