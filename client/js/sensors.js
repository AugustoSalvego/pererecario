// Sensores de movimento (computação ubíqua):
//  - acelerômetro: detectar o gesto de chacoalhar o celular;
//  - giroscópio/bússola: virar o celular para procurar a perereca na captura.
class Sensors extends EventTarget {
  granted = null;
  hasMotion = false;
  hasOrientation = false;
  lastMag = null;
  hits = [];
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

  onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    this.hasMotion = true;
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    if (this.lastMag != null) {
      const delta = Math.abs(mag - this.lastMag);
      const t = performance.now();
      if (delta > 12) {
        this.hits = this.hits.filter((h) => t - h < 900);
        this.hits.push(t);
        if (this.hits.length >= 3 && t - this.lastShake > 2500) {
          this.lastShake = t;
          this.hits = [];
          this.emit('shake');
        }
      }
    }
    this.lastMag = mag;
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
