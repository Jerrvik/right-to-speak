import {applyPanelPosition, button, categoryName, confirmAction, errorText, makeDraggable, node, statusWithIcon, t, userName} from "./dom.js";

export class GMPanel {
  constructor(transport, preferences, savePreferences) {
    this.transport = transport;
    this.preferences = preferences;
    this.savePreferences = savePreferences;
    this.filter = "all";
    this.expanded = new Set();
    this.settingsOpen = false;
    this.message = "";
    this.busy = false;
    this.element = node("section", "rts-panel rts-gm");
    this.element.setAttribute("aria-label", t("GMTitle"));
    document.body.append(this.element);
    this.render();
    window.addEventListener("resize", () => this.position());
  }

  position() {
    applyPanelPosition(this.element, this.preferences, "gmX", "gmY", () => Math.max(90, window.innerWidth - 740), () => 105);
  }

  pulse() {
    this.element.classList.remove("rts-pulse");
    void this.element.offsetWidth;
    this.element.classList.add("rts-pulse");
    setTimeout(() => this.element.classList.remove("rts-pulse"), 1700);
    if (this.preferences.sound && game.settings.get("right-to-speak", "allowSound")) this.beep();
  }

  beep() {
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.value = 0.02;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.onended = () => context.close();
    } catch { /* Audio is optional. */ }
  }

  async command(type, request) {
    if (this.busy) return;
    this.busy = true; this.message = ""; this.render();
    try { await this.transport.submit({type, id: request.id, expectedRevision: request.revision}); }
    catch (error) {
      this.message = errorText(error);
      if ((error?.code ?? error?.message) === "conflict") await this.transport.synchronize();
    }
    finally { this.busy = false; this.render(); }
  }

  async clear() {
    const count = this.transport.gmQueue().length;
    if (!count || !(await confirmAction("ConfirmClear", {count}))) return;
    this.busy = true; this.render();
    try { await this.transport.submit({type: "CLEAR_QUEUE"}); }
    catch (error) { this.message = errorText(error); }
    finally { this.busy = false; this.render(); }
  }

  filtered(requests) {
    if (this.filter === "urgent") return requests.filter(r => r.urgency === "urgent");
    if (this.filter === "normal") return requests.filter(r => r.urgency === "normal");
    if (this.filter === "private") return requests.filter(r => r.visibility === "gm");
    return requests;
  }

  requestRow(request) {
    const card = node("article", "rts-request");
    const summary = button("", "rts-summary", () => {
      if (this.expanded.has(request.id)) this.expanded.delete(request.id);
      else this.expanded.add(request.id);
      this.render();
    }, userName(request.ownerUserId));
    summary.setAttribute("aria-expanded", String(this.expanded.has(request.id)));
    summary.append(node("span", `rts-priority ${request.urgency === "urgent" ? "rts-priority-urgent" : ""}`, request.urgency === "urgent" ? "!" : "✋"));
    summary.append(node("span", "rts-username", userName(request.ownerUserId)));
    summary.append(node("span", "rts-category-name", categoryName(request.category)));
    if (request.visibility === "gm") summary.append(node("span", "rts-lock", "🔒"));
    card.append(summary);
    if (request.targetUserId) card.append(node("div", "rts-target-line", `→ ${userName(request.targetUserId)}`));
    card.append(node("div", "rts-status", statusWithIcon(request.status)));
    if (this.expanded.has(request.id)) {
      if (request.note) card.append(node("p", "rts-full-note", request.note));
      const controls = node("div", "rts-gm-actions");
      if (request.status === "pending") controls.append(button(t("Acknowledge"), "rts-button", () => this.command("ACKNOWLEDGE_REQUEST", request)));
      if (["pending", "acknowledged"].includes(request.status)) controls.append(button(t("GrantFloor"), "rts-button", () => this.command("GRANT_FLOOR", request)));
      controls.append(button(t("Close"), "rts-button rts-muted-button", () => this.command("CLOSE_REQUEST", request)));
      for (const control of controls.children) control.disabled = this.busy;
      card.append(controls);
    }
    return card;
  }

  section(body, title, requests) {
    const section = node("div", "rts-gm-section");
    section.append(node("h4", "", `${title} (${requests.length})`));
    if (!requests.length) section.append(node("p", "rts-empty", t("NoRequests")));
    for (const request of requests) section.append(this.requestRow(request));
    body.append(section);
  }

  render() {
    const collapsed = this.preferences.gmCollapsed;
    const requests = this.filtered(this.transport.gmQueue());
    this.element.classList.toggle("rts-collapsed", collapsed);
    this.element.classList.toggle("rts-reduced", this.preferences.reduceMotion);
    this.element.replaceChildren();
    const header = node("div", "rts-header");
    header.append(node("span", "rts-drag", "⠿"), node("strong", "rts-heading", t("GMTitle")));
    header.append(node("span", collapsed ? "rts-collapsed-count" : "rts-count", String(this.transport.gmQueue().length)));
    header.append(button(collapsed ? "+" : "−", "rts-collapse", () => {
      this.preferences.gmCollapsed = !collapsed; this.savePreferences(); this.render();
    }, collapsed ? t("Expand") : t("Collapse")));
    this.element.append(header);
    makeDraggable(this.element, header, this.preferences, this.savePreferences, "gmX", "gmY");
    if (!collapsed) {
      const body = node("div", "rts-body");
      const toolbar = node("div", "rts-gm-toolbar");
      const filter = node("select", "rts-filter");
      filter.setAttribute("aria-label", t("Filter"));
      for (const key of ["all", "urgent", "normal", "private"]) {
        const option = node("option", "", t(`FilterValue.${key}`)); option.value = key; filter.append(option);
      }
      filter.value = this.filter;
      filter.addEventListener("change", () => { this.filter = filter.value; this.render(); });
      const clear = button(t("ClearQueue"), "rts-button rts-muted-button", () => this.clear());
      clear.disabled = this.busy || !this.transport.gmQueue().length;
      toolbar.append(filter, clear);
      body.append(toolbar);
      this.section(body, t("UrgentSection"), requests.filter(r => r.urgency === "urgent"));
      this.section(body, t("NormalSection"), requests.filter(r => r.urgency === "normal"));
      if (this.message) body.append(node("p", "rts-message", this.message));
      if (this.transport.replicationFailures) body.append(node("p", "rts-message", t("ReplicaWarning", {count: this.transport.replicationFailures})));
      body.append(node("p", "rts-beta-note", t("BetaNotice")));
      body.append(button(t("Preferences"), "rts-link-button", () => { this.settingsOpen = !this.settingsOpen; this.render(); }));
      if (this.settingsOpen) {
        const sound = node("label", "rts-option");
        const soundBox = node("input"); soundBox.type = "checkbox"; soundBox.checked = this.preferences.sound;
        soundBox.addEventListener("change", () => { this.preferences.sound = soundBox.checked; this.savePreferences(); });
        sound.append(soundBox, node("span", "", t("Sound")));
        const motion = node("label", "rts-option");
        const motionBox = node("input"); motionBox.type = "checkbox"; motionBox.checked = this.preferences.reduceMotion;
        motionBox.addEventListener("change", () => { this.preferences.reduceMotion = motionBox.checked; this.savePreferences(); this.render(); });
        motion.append(motionBox, node("span", "", t("ReduceMotion")));
        body.append(sound, motion);
      }
      const clearLocal = button(t("ClearLocalPrivate"), "rts-link-button", async () => {
        if (await confirmAction("ConfirmClearLocal")) {
          try { await this.transport.clearPrivateLocal(); }
          catch (error) { this.message = errorText(error); this.render(); }
        }
      });
      body.append(clearLocal);
      this.element.append(body);
    }
    this.position();
  }
}
