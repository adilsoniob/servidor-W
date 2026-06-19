const cfg = (obj, key, fallback) => (obj && obj[key] !== undefined ? obj[key] : fallback);

export class StealthBehavior {
  constructor(opts) {
    this.enabled = cfg(opts, "enabled", false);
    this.opts = opts || {};
    this._sendCount = 0;
    this._pauseUntil = 0;
  }

  async variableDelay() {
    if (!this.enabled) return;
    const vd = this.opts.variableDelay || {};
    const min = cfg(vd, "min", 4000);
    const max = cfg(vd, "max", 14000);
    const delay = min + Math.random() * (max - min);
    await new Promise((r) => setTimeout(r, Math.round(delay)));
  }

  async checkRandomPause() {
    if (!this.enabled) return false;
    const rp = this.opts.randomPauses || {};
    const every = cfg(rp, "every", 5);
    const minSec = cfg(rp, "minSec", 15);
    const maxSec = cfg(rp, "maxSec", 120);
    this._sendCount++;
    if (this._sendCount >= every) {
      this._sendCount = 0;
      const pause = (minSec + Math.random() * (maxSec - minSec)) * 1000;
      this._pauseUntil = Date.now() + pause;
      await new Promise((r) => setTimeout(r, Math.round(pause)));
      return true;
    }
    return false;
  }

  get isOnPause() {
    return Date.now() < this._pauseUntil;
  }

  reset() {
    this._sendCount = 0;
    this._pauseUntil = 0;
  }
}
