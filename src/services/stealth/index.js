import { StealthBehavior } from "./behavior.js";
import { StealthScheduler } from "./scheduler.js";

export class Stealth {
  constructor(opts = {}) {
    this.behavior = new StealthBehavior(opts);
    this.scheduler = new StealthScheduler(opts);
  }

  get enabled() {
    return this.behavior.enabled;
  }

  set enabled(v) {
    this.behavior.enabled = v;
    this.scheduler.enabled = v;
  }

  async beforeSend(phone) {
    if (!this.enabled) return { allowed: true };

    if (!this.scheduler.isWithinBusinessHours()) {
      return { allowed: false, reason: "OUT_OF_HOURS", message: "Fora do horário comercial." };
    }
    if (!this.scheduler.checkDailyLimit()) {
      return { allowed: false, reason: "DAILY_LIMIT", message: "Limite diário atingido." };
    }
    if (!this.scheduler.checkContactWindow(phone)) {
      return { allowed: false, reason: "CONTACT_WINDOW", message: "Janela de 24h não expirada." };
    }

    await this.behavior.variableDelay();
    await this.behavior.checkRandomPause();

    return { allowed: true };
  }

  async afterSend(phone) {
    if (!this.enabled) return;
    this.scheduler.incrementDailyCount();
    this.scheduler.updateContactWindow(phone);
  }

  reset() {
    this.behavior.reset();
  }
}
