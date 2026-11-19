// Sensores de movimento (computação ubíqua):
//  - acelerômetro: detectar o gesto de chacoalhar o celular;
//  - orientação (bússola): disponível, mas a captura não depende dela.
const SHAKE_MS2 = 11;   // tranco mínimo (m/s², sem a gravidade)

class Sensors extends EventTarget {
  granted = null;
  hasMotion = false;
  hasOrientation = false;
  grav = null;     // gravidade estimada (filtro passa-baixa)
  hits = [];       // horários dos trancos fortes
  lastHit = 0;
  lastShake = 0;

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  needsPermission() {
    return typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
  }

  // No iPhone a permissão só pode ser pedida dentro de um toque do usuário.
  async request() {
    try {
      if (this.needsPermission()) {
        const a = await DeviceMotionEvent.requestPermission();
        const b = typeof DeviceOrientationEvent?.requestPermission === 'function' ? await DeviceOrientationEvent.requestPermission() : a;
        this.granted = a === 'granted' && b === 'granted';
      } else this.granted = true;
    } catch { this.granted = false; }
    if (this.granted) this.listen();
    return this.granted;
  }

  listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('devicemotion', (e) => this.onMotion(e));
    window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
  }

  // Chacoalhar = 3 trancos fortes em até 1,2 s. O tranco é a aceleração SEM a gravidade, em qualquer
  // direção. (Antes o jogo olhava só o tamanho da aceleração com a gravidade: chacoalhando de lado,
  // a direção muda mas o tamanho quase não muda, e o chacoalho não era percebido.)
  // Andar ou correr dá trancos de 3 a 8 m/s²; chacoalhar com vontade passa de 15.
  onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    this.hasMotion = true;
    const k = 0.85;
    const g = this.grav || { x: a.x, y: a.y, z: a.z };
    this.grav = { x: k * g.x + (1 - k) * a.x, y: k * g.y + (1 - k) * a.y, z: k * g.z + (1 - k) * a.z };
    const jolt = Math.hypot(a.x - this.grav.x, a.y - this.grav.y, a.z - this.grav.z);
    const t = performance.now();
    if (jolt > SHAKE_MS2 && t - this.lastHit > 90) {   // cada tranco conta uma vez
      this.lastHit = t;
      this.hits = this.hits.filter((h) => t - h < 1200);
      this.hits.push(t);
      if (this.hits.length >= 3 && t - this.lastShake > 2000) {
        this.lastShake = t;
        this.hits = [];
        this.emit('shake');
      }
    }
  }

  onOrientation(e) {
    const heading = e.webkitCompassHeading != null ? e.webkitCompassHeading : e.alpha != null ? 360 - e.alpha : null;
    if (heading == null) return;
    this.hasOrientation = true;
    this.emit('orientation', { heading, beta: e.beta, gamma: e.gamma });
  }

  simulateShake() { this.emit('shake', { simulated: true }); }
}

export const sensors = new Sensors();
