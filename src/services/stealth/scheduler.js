import fs from "node:fs";
import path from "node:path";

const cfg = (obj, key, fallback) => (obj && obj[key] !== undefined ? obj[key] : fallback);
const DATA_FILE = path.resolve("./data/stealth-tracker.json");

export class StealthScheduler {
  constructor(opts) {
    this.enabled = cfg(opts, "enabled", false);
    this.opts = opts || {};
    this._data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch {
      return { daily: {}, contactWindow: {} };
    }
  }

  _save() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(this._data, null, 2));
  }

  isWithinBusinessHours() {
    const bh = this.opts.businessHours || {};
    if (!cfg(bh, "enabled", false)) return true;
    const tz = cfg(bh, "timezone", "America/Sao_Paulo");
    const start = cfg(bh, "start", 8);
    const end = cfg(bh, "end", 21);
    const now = new Date();
    const br = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const h = br.getHours();
    return h >= start && h < end;
  }

  checkDailyLimit() {
    const dl = this.opts.dailyLimit || {};
    if (!cfg(dl, "enabled", false)) return true;
    const max = cfg(dl, "max", 80);
    const today = new Date().toDateString();
    return (this._data.daily[today] || 0) < max;
  }

  incrementDailyCount() {
    const today = new Date().toDateString();
    this._data.daily[today] = (this._data.daily[today] || 0) + 1;
    this._save();
  }

  checkContactWindow(phone) {
    const cw = this.opts.contactWindow || {};
    if (!cfg(cw, "enabled", false)) return true;
    const hours = cfg(cw, "hours", 24);
    const last = this._data.contactWindow[phone];
    if (!last) return true;
    return Date.now() - last > hours * 3600 * 1000;
  }

  updateContactWindow(phone) {
    this._data.contactWindow[phone] = Date.now();
    this._save();
  }

  get dailySent() {
    const today = new Date().toDateString();
    return this._data.daily[today] || 0;
  }
}
