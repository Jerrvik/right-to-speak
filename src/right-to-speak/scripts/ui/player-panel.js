import {applyPanelPosition, button, categoryName, confirmAction, errorText, iconButton, iconLabel, makeDraggable, node, preferenceControls, statusWithIcon, t, userName} from "./dom.js";
import {icon} from "./icons.js";
import {playSound} from "./sound.js";
import {validatePersonalDraft} from "../core/personal.js";
import {displayContent, displayUserName} from "./display.js";

const TYPES = ["action", "support", "counteraction", "clarification"];
function pendingKey() { return `rts-pending:${game.world.id}:${game.user.id}`; }

export class PlayerPanel {
  constructor(transport, personal, preferences, savePreferences) {
    this.transport = transport;
    this.personal = personal;
    this.preferences = preferences;
    this.savePreferences = savePreferences;
    this.composeUrgent = !transport.activeOwn();
    this.composeWord = false;
    this.editorOpen = false;
    this.personalOpen = false;
    this.historyOpen = false;
    this.settingsOpen = false;
    this.formDraft = null;
    this.personalDraft = {targetUserId: "", text: ""};
    this.pendingDraft = null;
    this.toastId = null;
    this.busy = false;
    this.personalBusy = false;
    this.message = "";
    this.personalMessage = "";
    this.lastOwnStatus = transport.activeOwn()?.status ?? null;
    this.terminalNoticeUntil = 0;
    try { this.pendingDraft = JSON.parse(localStorage.getItem(pendingKey()) || "null"); } catch { /* Storage unavailable. */ }
    this.element = node("section", "rts-panel rts-player");
    this.element.setAttribute("aria-label", t("PlayerTitle"));
    this.toast = node("aside", "rts-personal-toast");
    this.toast.setAttribute("role", "status");
    document.body.append(this.element, this.toast);
    this.render();
    window.addEventListener("resize", () => this.position());
  }

  position() { applyPanelPosition(this.element, this.preferences, "x", "y", () => 90, () => 105); }

  notifyPersonal(message) {
    this.toastId = message.id;
    this.renderToast();
    void playSound("personal", this.preferences);
  }

  renderToast() {
    const message = this.toastId ? this.personal.incoming(this.toastId) : null;
    this.toast.replaceChildren();
    this.toast.classList.toggle("rts-reduced", this.preferences.reduceMotion);
    this.toast.classList.toggle("rts-visible", !!message && message.status === "unread");
    if (!message || message.status !== "unread") return;
    const header = node("div", "rts-notice-head");
    header.append(icon("mail"), node("strong", "", t("PersonalTitle")), node("span", "rts-spacer"));
    header.append(iconButton("minus", "rts-icon-button", () => { this.toastId = null; this.renderToast(); }, t("Collapse")));
    this.toast.append(header);
    const body = node("div", "rts-notice-body");
    const sender = node("div", "rts-notice-sender");
    sender.append(node("strong", "", userName(message.senderUserId, this.preferences)), node("span", "rts-small-badge", t("PersonalStatus.unread")));
    body.append(sender, node("p", "rts-notice-text", displayContent(message.text)));
    const actions = node("div", "rts-notice-actions");
    actions.append(button(t("Later"), "rts-card-button", () => { this.toastId = null; this.renderToast(); }));
    actions.append(button(t("Acknowledge"), "rts-card-button rts-personal-seen", () => this.markPersonalRead(message.id)));
    body.append(actions, node("div", "rts-notice-meta", t("PersonalRemains")));
    this.toast.append(body);
  }

  rememberPending() {
    try {
      if (this.pendingDraft) localStorage.setItem(pendingKey(), JSON.stringify(this.pendingDraft));
      else localStorage.removeItem(pendingKey());
    } catch { /* In-memory retry remains available. */ }
  }

  captureDraft() {
    const editor = this.element.querySelector(".rts-editor");
    if (editor) {
      const target = editor.querySelector(".rts-target");
      const note = editor.querySelector(".rts-note");
      if (target && note) this.formDraft = {
        category: editor.querySelector(".rts-category-button.rts-selected")?.dataset.category ?? this.formDraft?.category ?? "word",
        targetUserId: target.value || null,
        note: note.value
      };
    }
    const personal = this.element.querySelector(".rts-personal-compose");
    if (personal && !this.personalDraft.id) {
      this.personalDraft = {
        targetUserId: personal.querySelector(".rts-personal-target")?.value ?? "",
        text: personal.querySelector(".rts-personal-text")?.value ?? ""
      };
    }
  }

  async run(command) {
    if (this.busy) return;
    this.busy = true; this.message = t("Transport.sending"); this.render();
    try {
      await this.transport.submit(command);
      this.message = "";
      if (command.type === "CREATE_REQUEST") { this.pendingDraft = null; this.rememberPending(); }
      this.composeUrgent = false; this.composeWord = false; this.editorOpen = false; this.formDraft = null;
    } catch (error) {
      this.message = errorText(error);
      if ((error?.code ?? error?.message) === "conflict") await this.transport.synchronize();
    } finally { this.busy = false; this.render(false); }
  }

  async createWord() {
    const current = this.transport.activeOwn();
    if (current) { this.composeUrgent = false; this.editorOpen = true; this.formDraft = null; this.render(false); return; }
    if (this.pendingDraft) { this.message = t("Error.pendingVisibility"); this.render(); return; }
    if (!this.transport.lastCoordinatorId) { this.message = t("Error.gmOffline"); this.render(); return; }
    this.composeUrgent = false;
    this.pendingDraft = {id: foundry.utils.randomID(), urgency: "normal", category: "word", targetUserId: null, note: "", visibility: this.preferences.private ? "gm" : "public"};
    this.rememberPending();
    await this.run({type: "CREATE_REQUEST", draft: this.pendingDraft});
  }

  beginWord() {
    const current = this.transport.activeOwn();
    if (current) { this.composeUrgent = false; this.composeWord = false; this.editorOpen = true; this.formDraft = null; this.render(false); return; }
    this.composeWord = true;
    this.composeUrgent = false;
    this.personalOpen = false;
    this.editorOpen = false;
    this.render(false);
  }

  beginUrgent() {
    if (this.pendingDraft && !this.transport.activeOwn()) { this.message = t("Error.pendingVisibility"); this.render(); return; }
    this.composeUrgent = true;
    this.composeWord = false;
    this.personalOpen = false;
    this.editorOpen = false;
    this.formDraft = null;
    this.render(false);
  }

  async submitUrgent() {
    this.captureDraft();
    const draft = this.formDraft;
    if (!draft || !TYPES.includes(draft.category)) { this.message = t("SelectCategory"); this.render(); return; }
    const current = this.transport.activeOwn();
    if (current?.urgency === "urgent") {
      await this.run({type: "UPDATE_REQUEST", id: current.id, expectedRevision: current.revision, ...draft});
    } else if (current) {
      if (!(await confirmAction("ConfirmEscalate"))) return;
      await this.run({type: "ESCALATE_WITH_DETAILS", id: current.id, expectedRevision: current.revision, ...draft});
    } else {
      if (!this.transport.lastCoordinatorId) { this.message = t("Error.gmOffline"); this.render(); return; }
      this.pendingDraft = {id: foundry.utils.randomID(), urgency: "urgent", ...draft, visibility: this.preferences.private ? "gm" : "public"};
      this.rememberPending();
      await this.run({type: "CREATE_REQUEST", draft: this.pendingDraft});
    }
  }

  async changeVisibility(checked) {
    const current = this.transport.activeOwn();
    if (!current) {
      if (this.pendingDraft) { this.message = t("Error.pendingVisibility"); this.render(); return; }
      this.preferences.private = checked; this.savePreferences(); this.render(false); return;
    }
    if (!(await confirmAction(checked ? "ConfirmMakePrivate" : "ConfirmMakePublic"))) { this.render(); return; }
    await this.run({type: "SET_VISIBILITY", id: current.id, visibility: checked ? "gm" : "public", expectedRevision: current.revision});
    if (!this.message) { this.preferences.private = checked; this.savePreferences(); }
    this.render();
  }

  async saveEditor() {
    this.captureDraft();
    const current = this.transport.activeOwn();
    if (current && this.formDraft) await this.run({type: "UPDATE_REQUEST", id: current.id, expectedRevision: current.revision, ...this.formDraft});
  }

  renderEditor(body, current, urgentCompose = false) {
    const draft = this.formDraft ?? {
      category: urgentCompose ? (TYPES.includes(current?.category) ? current.category : "action") : current?.category ?? "word",
      targetUserId: current?.targetUserId ?? null, note: current?.note ?? ""
    };
    const editor = node("div", "rts-editor");
    if (urgentCompose || current?.urgency === "urgent") {
      editor.append(node("div", "rts-rule"), node("div", "rts-kind-label", t("ChooseAction")));
      const grid = node("div", "rts-category-grid");
      for (const type of TYPES) {
        const choice = button("", `rts-category-button ${draft.category === type ? "rts-selected" : ""}`, () => {
          this.captureDraft();
          this.formDraft.category = type;
          if (!["support", "counteraction"].includes(type)) this.formDraft.targetUserId = null;
          this.render(false);
        });
        choice.dataset.category = type;
        choice.setAttribute("aria-pressed", String(draft.category === type));
        const head = node("span", "rts-category-head");
        head.append(icon(type, `rts-kind-color-${type}`), node("span", "", t(`CategoryButton.${type}`)));
        choice.append(head, node("span", "rts-category-description", t(`CategoryDescription.${type}`)));
        grid.append(choice);
      }
      editor.append(grid);
    }
    const targetRow = node("div", "rts-target-row");
    if (!["support", "counteraction"].includes(draft.category) && !draft.targetUserId) targetRow.hidden = true;
    targetRow.append(node("label", "rts-target-label", t("TargetShort")));
    const search = node("input", "rts-target-search");
    search.type = "search"; search.placeholder = t("SearchShort"); search.setAttribute("aria-label", t("SearchUsers"));
    const target = node("select", "rts-target"); target.setAttribute("aria-label", t("TargetLabel"));
    const addOptions = filter => {
      const selected = target.value || draft.targetUserId || "";
      target.replaceChildren();
      const none = node("option", "", t("NoTarget")); none.value = ""; target.append(none);
      const users = game.users.filter(user => user.id !== game.user.id && (user.active || user.id === selected)
        && displayUserName(user, this.preferences.nameDisplay, "").toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
      for (const user of users) { const option = node("option", "", displayUserName(user, this.preferences.nameDisplay, t("UnknownUser"))); option.value = user.id; target.append(option); }
      target.value = users.some(user => user.id === selected) ? selected : "";
    };
    addOptions(""); search.addEventListener("input", () => addOptions(search.value));
    targetRow.append(search, target); editor.append(targetRow);
    const comment = node("div", "rts-comment-wrap");
    const note = node("textarea", "rts-note"); note.maxLength = 240; note.rows = 2; note.value = displayContent(draft.note);
    note.placeholder = t("NotePlaceholder"); note.setAttribute("aria-label", t("NoteLabel"));
    const privacy = iconButton("lock", `rts-privacy-toggle ${current?.visibility === "gm" || (!current && this.preferences.private) ? "rts-on" : ""}`, () => this.changeVisibility(!(current ? current.visibility === "gm" : this.preferences.private)), t("OnlyGM"));
    privacy.setAttribute("aria-pressed", String(current ? current.visibility === "gm" : this.preferences.private));
    privacy.disabled = this.busy || (!!this.pendingDraft && !current);
    comment.append(note, privacy); editor.append(comment);
    const actions = node("div", "rts-editor-actions");
    const save = button(urgentCompose && !current ? t("SendUrgent") : t("Save"), `rts-button ${urgentCompose ? "rts-send-urgent" : ""}`, () => urgentCompose ? this.submitUrgent() : this.saveEditor());
    save.disabled = this.busy || (urgentCompose && !this.transport.lastCoordinatorId);
    actions.append(save);
    if (current) actions.append(button(t("HideEditor"), "rts-mini-link", () => {
      this.composeUrgent = false; this.editorOpen = false; this.formDraft = null; this.render(false);
    }));
    editor.append(actions); body.append(editor);
  }

  async sendPersonal() {
    this.captureDraft();
    if (this.personalBusy) return;
    if (!this.personalDraft.id) {
      const draft = {...this.personalDraft, id: foundry.utils.randomID()};
      try { validatePersonalDraft(draft, game.user.id, game.users); }
      catch (error) { this.personalMessage = errorText(error); this.render(false); return; }
      this.personalDraft = draft;
    }
    this.personalBusy = true; this.personalMessage = t("Transport.sending"); this.render();
    try {
      await this.personal.send(this.personalDraft);
      this.personalDraft = {targetUserId: "", text: ""};
      this.personalOpen = true; this.historyOpen = true; this.personalMessage = "";
    } catch (error) { this.personalMessage = errorText(error); }
    finally { this.personalBusy = false; this.render(false); }
  }

  async markPersonalRead(id) {
    try { await this.personal.markRead(id); this.toastId = null; this.render(); }
    catch (error) { this.personalMessage = errorText(error); this.render(); }
  }

  renderPersonal(body) {
    const box = node("section", "rts-personal-section");
    box.append(node("div", "rts-rule"), node("div", "rts-kind-label", t("PersonalTitle")));
    if (this.personalOpen) {
      const compose = node("div", "rts-personal-compose");
      compose.append(node("label", "rts-target-label", t("Recipient")));
      const target = node("select", "rts-personal-target");
      const empty = node("option", "", t("ChooseRecipient")); empty.value = ""; target.append(empty);
      for (const user of game.users.filter(user => user.active && !user.isGM && user.id !== game.user.id)) {
        const option = node("option", "", displayUserName(user, this.preferences.nameDisplay, t("UnknownUser"))); option.value = user.id; target.append(option);
      }
      target.value = this.personalDraft.targetUserId;
      target.disabled = !!this.personalDraft.id;
      const text = node("textarea", "rts-personal-text"); text.rows = 2; text.maxLength = 240;
      text.placeholder = t("PersonalPlaceholder"); text.value = this.personalDraft.id ? displayContent(this.personalDraft.text) : this.personalDraft.text; text.disabled = !!this.personalDraft.id;
      const send = button(t("SendPersonal"), "rts-button rts-personal-send", () => this.sendPersonal());
      send.disabled = this.personalBusy || !this.personal.ready;
      compose.append(target, text, send, button(t("BackToRequests"), "rts-mini-link", () => {
        this.captureDraft(); this.personalOpen = false; this.render(false);
      }));
      if (this.personalDraft.id) compose.append(button(t("DiscardPending"), "rts-link-button", async () => {
        if (await confirmAction("ConfirmDiscardPersonal")) {
          this.personalDraft = {targetUserId: "", text: ""}; this.personalMessage = ""; this.render();
        }
      }));
      box.append(compose);
    }
    if (this.personalMessage) box.append(node("p", "rts-message", this.personalMessage));
    box.append(button(t("PersonalHistory"), "rts-link-button", () => {
      this.captureDraft(); this.historyOpen = !this.historyOpen; this.render();
    }));
    if (this.historyOpen) {
      const list = node("div", "rts-personal-history");
      const messages = this.personal.history();
      if (!messages.length) list.append(node("p", "rts-empty", t("NoPersonalHistory")));
      for (const message of messages) {
        const incoming = message.targetUserId === game.user.id;
        const row = node("article", `rts-personal-item ${incoming && message.status === "unread" ? "rts-unread" : ""}`);
        row.append(node("strong", "", `${incoming ? "←" : "→"} ${userName(incoming ? message.senderUserId : message.targetUserId, this.preferences)}`));
        const createdAt = new Date(message.createdAt);
        if (createdAt.getUTCFullYear() >= 2020) {
          row.append(node("time", "", createdAt.toLocaleTimeString(game.i18n.lang, {hour: "2-digit", minute: "2-digit"})));
        }
        row.append(node("p", "", displayContent(message.text)));
        row.append(node("span", "rts-personal-status", t(`PersonalStatus.${message.status}`)));
        if (incoming && message.status === "unread") row.append(button(t("Acknowledge"), "rts-button", () => this.markPersonalRead(message.id)));
        if (!incoming && message.status === "sending") row.append(button(t("Retry"), "rts-button", async () => {
          this.personalDraft = {id: message.id, targetUserId: message.targetUserId, text: message.text};
          await this.sendPersonal();
        }));
        list.append(row);
      }
      box.append(list);
    }
    body.append(box);
  }

  render(capture = true) {
    if (capture) this.captureDraft();
    const current = this.transport.activeOwn();
    if (current?.status === "floor" && this.lastOwnStatus !== "floor") void playSound("floor", this.preferences);
    if (!current && this.lastOwnStatus && !["closed", "cancelled"].includes(this.lastOwnStatus)) {
      this.terminalNoticeUntil = Date.now() + 15000;
    }
    this.lastOwnStatus = current?.status ?? null;
    const collapsed = this.preferences.collapsed;
    this.element.classList.toggle("rts-collapsed", collapsed);
    this.element.classList.toggle("rts-reduced", this.preferences.reduceMotion);
    this.element.replaceChildren();
    const header = node("div", "rts-header");
    header.append(icon("grip", "rts-grip"), node("strong", "rts-heading", t("PlayerTitle")), node("span", "rts-spacer"));
    if (!collapsed) {
      const mail = iconButton("mail", "rts-icon-button rts-personal-toggle", () => {
        this.captureDraft(); this.personalOpen = !this.personalOpen; this.composeWord = false; this.historyOpen = false; this.render(false);
      }, t("PersonalTitle"));
      if (this.personal.unreadCount()) mail.append(node("span", "rts-unread-count", String(this.personal.unreadCount())));
      header.append(mail);
      header.append(iconButton("more", "rts-icon-button rts-menu-toggle", () => { this.settingsOpen = !this.settingsOpen; this.render(); }, t("Menu")));
    }
    header.append(iconButton(collapsed ? "plus" : "minus", "rts-icon-button rts-collapse", () => {
      this.preferences.collapsed = !collapsed; this.savePreferences(); this.render();
    }, collapsed ? t("Expand") : t("Collapse")));
    this.element.append(header);
    makeDraggable(this.element, header, this.preferences, this.savePreferences, "x", "y");
    if (!collapsed) {
      if (this.settingsOpen) {
        const menu = node("div", "rts-drop-menu rts-player-menu");
        menu.append(node("div", "rts-menu-title", t("MenuTitle")), preferenceControls(this.preferences, this.savePreferences, () => this.render()));
        const visible = this.transport.visiblePublic();
        if (visible.length) {
          const list = node("div", "rts-public-list"); list.append(node("h4", "", t("PublicQueue")));
          for (const request of visible) list.append(node("div", "rts-public-row", `${t("QueuePosition", {order: request.order})} · ${userName(request.ownerUserId, this.preferences)} · ${categoryName(request.category)} · ${statusWithIcon(request.status)}`));
          menu.append(list);
        }
        this.element.append(menu);
      }
      const body = node("div", "rts-body");
      const actions = node("div", "rts-primary-actions");
      const word = button("", `rts-primary rts-word ${this.composeWord ? "rts-primary-selected" : ""}`, () => this.beginWord()); word.append(iconLabel("hand", t("Word")));
      const urgent = button("", `rts-primary rts-urgent ${this.composeUrgent ? "rts-primary-selected" : ""}`, () => this.beginUrgent());
      urgent.append(iconLabel("alert", t("Intervene")));
      const noGM = !this.transport.lastCoordinatorId;
      word.disabled = this.busy || noGM; urgent.disabled = this.busy || noGM;
      actions.append(word, urgent); body.append(actions);
      if (this.personalOpen) this.renderPersonal(body);
      else {
        if (this.composeUrgent) this.renderEditor(body, current, true);
        else if (this.composeWord && !current) {
          const form = node("div", "rts-word-form");
          form.append(node("div", "rts-rule"), node("div", "rts-inline-hint", t("WordHint")));
          const privacy = button("", `rts-word-privacy ${this.preferences.private ? "rts-on" : ""}`, () => this.changeVisibility(!this.preferences.private), t("OnlyGM"));
          privacy.append(icon("lock"), node("span", "", t("OnlyGM")));
          privacy.setAttribute("aria-pressed", String(this.preferences.private));
          privacy.disabled = this.busy || !!this.pendingDraft;
          form.append(privacy);
          const send = button(t("SendWord"), "rts-button rts-send-urgent", () => this.createWord());
          send.disabled = this.busy || noGM;
          form.append(send); body.append(form);
        }
        else if (this.editorOpen && current) this.renderEditor(body, current);
        if (current) {
          const status = node("div", "rts-own-status");
          const line = node("div", "rts-status-line");
          line.append(node("span", `rts-status-pill rts-status-${current.status}`, statusWithIcon(current.status)), node("span", "", categoryName(current.category)));
          status.append(line);
          const ownNote = displayContent(current.note);
          if (ownNote) status.append(node("p", "rts-own-note", ownNote));
          const controls = node("div", "rts-status-actions");
          controls.append(button(t("Edit"), "rts-card-button", () => {
            this.editorOpen = !this.editorOpen; this.composeUrgent = false; this.formDraft = null; this.render(false);
          }));
          controls.append(button(t("Cancel"), "rts-card-button", async () => {
            if (await confirmAction("ConfirmCancel")) await this.run({type: "CANCEL_REQUEST", id: current.id, expectedRevision: current.revision});
          }));
          status.append(controls); body.append(status);
        } else {
          const latest = this.transport.latestOwn();
          if (latest && ["closed", "cancelled"].includes(latest.status)
            && Date.now() < this.terminalNoticeUntil) {
            body.append(node("div", "rts-own-status rts-terminal-status", statusWithIcon(latest.status)));
          }
        }
      }
      if (this.pendingDraft && !current) {
        const retry = node("div", "rts-status-actions");
        retry.append(button(t("Retry"), "rts-button", () => this.run({type: "CREATE_REQUEST", draft: this.pendingDraft})));
        retry.append(button(t("DiscardPending"), "rts-button rts-muted-button", async () => {
          if (await confirmAction("ConfirmDiscardPending")) { this.pendingDraft = null; this.rememberPending(); this.message = ""; this.render(); }
        }));
        body.append(retry);
      }
      if (this.message || noGM) body.append(node("p", "rts-message", this.message || t("Error.gmOffline")));
      this.element.append(body);
    }
    this.position();
    this.renderToast();
  }
}
