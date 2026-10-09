import {applyPanelPosition, button, categoryName, confirmAction, errorText, iconLabel, makeDraggable, node, statusWithIcon, t, userName} from "./dom.js";

function pendingKey() { return `rts-pending:${game.world.id}:${game.user.id}`; }

export class PlayerPanel {
  constructor(transport, preferences, savePreferences) {
    this.transport = transport;
    this.preferences = preferences;
    this.savePreferences = savePreferences;
    this.editorOpen = false;
    this.settingsOpen = false;
    this.formDraft = null;
    this.busy = false;
    this.message = "";
    this.pendingDraft = null;
    this.knownUrgent = new Set(transport.visiblePublic().filter(r => r.urgency === "urgent").map(r => r.id));
    try { this.pendingDraft = JSON.parse(localStorage.getItem(pendingKey()) || "null"); } catch { /* Storage unavailable. */ }
    this.element = node("section", "rts-panel rts-player");
    this.element.setAttribute("aria-label", t("PlayerTitle"));
    document.body.append(this.element);
    this.render();
    window.addEventListener("resize", () => this.position());
  }

  position() {
    applyPanelPosition(this.element, this.preferences, "x", "y", () => 90, () => 105);
  }

  notifyPublicUrgent() {
    const urgent = this.transport.visiblePublic().filter(r => r.urgency === "urgent");
    const arrivals = urgent.filter(r => !this.knownUrgent.has(r.id));
    this.knownUrgent = new Set(urgent.map(r => r.id));
    if (arrivals.length && this.preferences.sound && game.settings.get("right-to-speak", "allowSound")) {
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 520;
        gain.gain.value = 0.015;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 0.1);
        oscillator.onended = () => context.close();
      } catch { /* Audio is optional. */ }
    }
  }

  rememberPending() {
    try {
      if (this.pendingDraft) localStorage.setItem(pendingKey(), JSON.stringify(this.pendingDraft));
      else localStorage.removeItem(pendingKey());
    } catch { /* In-memory retry remains available. */ }
  }

  captureDraft() {
    if (!this.editorOpen) return;
    const category = this.element.querySelector(".rts-category");
    const target = this.element.querySelector(".rts-target");
    const note = this.element.querySelector(".rts-note");
    if (category && target && note) this.formDraft = {category: category.value, targetUserId: target.value || null, note: note.value};
  }

  async run(command) {
    if (this.busy) return;
    this.busy = true;
    this.message = t("Transport.sending");
    this.render();
    try {
      await this.transport.submit(command);
      this.message = "";
      if (command.type === "CREATE_REQUEST") { this.pendingDraft = null; this.rememberPending(); }
    } catch (error) {
      this.message = errorText(error);
      if ((error?.code ?? error?.message) === "conflict") await this.transport.synchronize();
    } finally { this.busy = false; this.render(); }
  }

  async create(urgency) {
    const current = this.transport.activeOwn();
    if (current) {
      if (urgency === "urgent" && current.urgency === "normal") {
        if (await confirmAction("ConfirmEscalate")) await this.run({type: "ESCALATE", id: current.id, expectedRevision: current.revision});
      }
      this.editorOpen = true;
      this.render();
      return;
    }
    if (!this.transport.lastCoordinatorId) { this.message = t("Error.gmOffline"); this.render(); return; }
    if (!this.pendingDraft) {
      this.pendingDraft = {
        id: foundry.utils.randomID(), urgency, category: urgency === "urgent" ? "intervention" : "word",
        targetUserId: null, note: "", visibility: this.preferences.private ? "gm" : "public"
      };
      this.rememberPending();
    }
    await this.run({type: "CREATE_REQUEST", draft: this.pendingDraft});
    if (urgency === "urgent" && this.transport.activeOwn()) { this.editorOpen = true; this.render(); }
  }

  async changeVisibility(checked) {
    const current = this.transport.activeOwn();
    if (!current) {
      if (this.pendingDraft) { this.message = t("Error.pendingVisibility"); this.render(); return; }
      this.preferences.private = checked;
      this.savePreferences();
      return;
    }
    const key = checked ? "ConfirmMakePrivate" : "ConfirmMakePublic";
    if (!(await confirmAction(key))) { this.render(); return; }
    await this.run({type: "SET_VISIBILITY", id: current.id, visibility: checked ? "gm" : "public", expectedRevision: current.revision});
    if (!this.message) { this.preferences.private = checked; this.savePreferences(); }
    this.render();
  }

  async saveEditor() {
    this.captureDraft();
    const current = this.transport.activeOwn();
    if (!current || !this.formDraft) return;
    await this.run({type: "UPDATE_REQUEST", id: current.id, expectedRevision: current.revision, ...this.formDraft});
    if (!this.message) this.editorOpen = false;
    this.render();
  }

  renderEditor(body, current) {
    const draft = this.formDraft ?? {category: current.category, targetUserId: current.targetUserId, note: current.note};
    const editor = node("div", "rts-editor");
    if (current.urgency === "urgent") {
      editor.append(node("label", "rts-field-label", t("CategoryLabel")));
      const category = node("select", "rts-category");
      category.setAttribute("aria-label", t("CategoryLabel"));
      for (const value of ["intervention", "action", "support", "counteraction", "clarification"]) {
        const option = node("option", "", categoryName(value)); option.value = value; category.append(option);
      }
      category.value = draft.category;
      editor.append(category);
    } else {
      const category = node("input", "rts-category"); category.type = "hidden"; category.value = "word"; editor.append(category);
    }
    editor.append(node("label", "rts-field-label", t("TargetLabel")));
    const search = node("input", "rts-target-search");
    search.type = "search"; search.placeholder = t("SearchUsers"); search.setAttribute("aria-label", t("SearchUsers"));
    const target = node("select", "rts-target");
    target.setAttribute("aria-label", t("TargetLabel"));
    const addOptions = filter => {
      const selected = target.value || draft.targetUserId || "";
      target.replaceChildren();
      const none = node("option", "", t("NoTarget")); none.value = ""; target.append(none);
      const users = game.users.filter(user => user.id !== game.user.id && (user.active || user.id === selected) && user.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
      for (const user of users) { const option = node("option", "", user.name); option.value = user.id; target.append(option); }
      target.value = users.some(user => user.id === selected) ? selected : "";
    };
    addOptions("");
    search.addEventListener("input", () => addOptions(search.value));
    editor.append(search, target, node("label", "rts-field-label", t("NoteLabel")));
    const note = node("textarea", "rts-note"); note.maxLength = 240; note.rows = 3; note.value = draft.note;
    note.setAttribute("aria-label", t("NoteLabel"));
    editor.append(note);
    const actions = node("div", "rts-actions");
    actions.append(button(t("Save"), "rts-button", () => this.saveEditor()), button(t("HideEditor"), "rts-button rts-muted-button", () => { this.editorOpen = false; this.formDraft = null; this.render(); }));
    editor.append(actions);
    body.append(editor);
  }

  render() {
    this.captureDraft();
    const current = this.transport.activeOwn();
    const isCollapsed = this.preferences.collapsed;
    const visibleUrgent = this.transport.visiblePublic().some(r => r.urgency === "urgent") || current?.urgency === "urgent";
    this.element.classList.toggle("rts-collapsed", isCollapsed);
    this.element.classList.toggle("rts-reduced", this.preferences.reduceMotion);
    this.element.classList.toggle("rts-has-urgent", visibleUrgent);
    this.element.replaceChildren();
    const header = node("div", "rts-header");
    header.append(node("span", "rts-drag", "⠿"), node("strong", "rts-heading", t("PlayerTitle")));
    if (isCollapsed) {
      const visibleIds = new Set(this.transport.visiblePublic().map(request => request.id));
      if (current) visibleIds.add(current.id);
      header.append(node("span", "rts-collapsed-count", String(visibleIds.size)));
    }
    const collapse = button(isCollapsed ? "+" : "−", "rts-collapse", () => { this.preferences.collapsed = !isCollapsed; this.savePreferences(); this.render(); }, isCollapsed ? t("Expand") : t("Collapse"));
    header.append(collapse);
    this.element.append(header);
    makeDraggable(this.element, header, this.preferences, this.savePreferences, "x", "y");
    if (!isCollapsed) {
      const body = node("div", "rts-body");
      const actions = node("div", "rts-primary-actions");
      const word = button("", "rts-primary rts-word", () => this.create("normal"));
      word.append(iconLabel("✋", t("Word")));
      const urgent = button("", "rts-primary rts-urgent", () => this.create("urgent"));
      urgent.append(iconLabel("!", t("Intervene")));
      const noGM = !this.transport.lastCoordinatorId;
      word.disabled = urgent.disabled = this.busy || noGM;
      actions.append(word, urgent);
      body.append(actions);
      const privacy = node("label", "rts-privacy");
      const checkbox = node("input"); checkbox.type = "checkbox"; checkbox.checked = current ? current.visibility === "gm" : this.preferences.private;
      checkbox.disabled = this.busy || (!!this.pendingDraft && !current);
      checkbox.addEventListener("change", () => this.changeVisibility(checkbox.checked));
      privacy.append(checkbox, node("span", "", `🔒 ${t("OnlyGM")}`));
      body.append(privacy);
      if (current) {
        const status = node("div", "rts-own-status", `${statusWithIcon(current.status)} · ${categoryName(current.category)}`);
        status.setAttribute("aria-live", "polite");
        body.append(status);
        const controls = node("div", "rts-actions");
        controls.append(button(t("Edit"), "rts-button", () => { this.editorOpen = !this.editorOpen; this.formDraft = null; this.render(); }));
        controls.append(button(t("Cancel"), "rts-button rts-muted-button", async () => {
          if (await confirmAction("ConfirmCancel")) await this.run({type: "CANCEL_REQUEST", id: current.id, expectedRevision: current.revision});
        }));
        body.append(controls);
        if (this.editorOpen) this.renderEditor(body, current);
      } else {
        this.editorOpen = false; this.formDraft = null;
        const latest = this.transport.latestOwn();
        if (latest && ["closed", "cancelled"].includes(latest.status)) {
          body.append(node("div", "rts-own-status", statusWithIcon(latest.status)));
        }
      }
      if (this.pendingDraft && !current) {
        const retryActions = node("div", "rts-actions");
        retryActions.append(button(t("Retry"), "rts-button", () => this.run({type: "CREATE_REQUEST", draft: this.pendingDraft})));
        retryActions.append(button(t("DiscardPending"), "rts-button rts-muted-button", async () => {
          if (await confirmAction("ConfirmDiscardPending")) {
            this.pendingDraft = null; this.rememberPending(); this.message = ""; this.render();
          }
        }));
        body.append(retryActions);
      }
      if (this.message || noGM) body.append(node("p", "rts-message", this.message || t("Error.gmOffline")));
      const visible = this.transport.visiblePublic();
      if (visible.length) {
        const list = node("div", "rts-public-list");
        list.append(node("h4", "", t("PublicQueue")));
        for (const request of visible) {
          const row = node("div", "rts-public-row", `${t("QueuePosition", {order: request.order})} · ${userName(request.ownerUserId)} · ${categoryName(request.category)} · ${statusWithIcon(request.status)}`);
          row.title = userName(request.ownerUserId);
          list.append(row);
        }
        body.append(list);
      }
      const prefsToggle = button(t("Preferences"), "rts-link-button", () => { this.settingsOpen = !this.settingsOpen; this.render(); });
      body.append(prefsToggle);
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
      this.element.append(body);
    }
    this.position();
  }
}
