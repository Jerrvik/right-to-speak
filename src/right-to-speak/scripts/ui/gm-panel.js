import {applyPanelPosition, button, categoryName, confirmAction, errorText, iconButton, makeDraggable, node, preferenceControls, statusName, t, userName} from "./dom.js";
import {icon} from "./icons.js";
import {playSound} from "./sound.js";
import {displayContent} from "./display.js";
import {ACTIVE} from "../core/request-model.js";

export class GMPanel {
  constructor(transport, personal, preferences, savePreferences) {
    this.transport = transport;
    this.personal = personal;
    this.preferences = preferences;
    this.savePreferences = savePreferences;
    this.filter = "all";
    this.newIds = new Set();
    this.menuOpen = false;
    this.historyOpen = false;
    this.message = "";
    this.busy = false;
    this.replyOpen = null;
    this.replyDrafts = new Map();
    this.soundHint = "";
    this.element = node("section", "rts-panel rts-gm");
    this.element.setAttribute("aria-label", t("GMTitle"));
    document.body.append(this.element);
    this.render();
    window.addEventListener("resize", () => this.position());
  }

  position() { applyPanelPosition(this.element, this.preferences, "gmX", "gmY", () => Math.max(90, window.innerWidth - 740), () => 105); }

  notifyArrival(request) {
    this.newIds.add(request.id);
    this.render();
    if (request.urgency === "urgent") {
      this.element.classList.remove("rts-pulse");
      void this.element.offsetWidth;
      this.element.classList.add("rts-pulse");
      setTimeout(() => this.element.classList.remove("rts-pulse"), 2300);
    }
    setTimeout(() => { this.newIds.delete(request.id); this.render(); }, 2300);
    void this.playAlert(request.urgency === "urgent" ? "urgent" : "word");
  }

  notifyMessage(message) {
    if (message.kind !== "request") return;
    void this.playAlert("personal");
  }

  async playAlert(type) {
    if (await playSound(type, this.preferences) === "blocked") {
      this.soundHint = t("SoundBlocked");
      this.render();
    }
  }

  captureReply() {
    const input = this.element.querySelector(".rts-request-reply-input");
    if (input && this.replyOpen) {
      const checkbox = this.element.querySelector(".rts-reply-public input");
      this.replyDrafts.set(this.replyOpen, {...(this.replyDrafts.get(this.replyOpen) ?? {}),
        text: input.value, publicAnswer: checkbox?.checked === true});
    }
  }

  async sendReply(request) {
    if (this.busy || !ACTIVE.has(request.status)) return;
    this.captureReply();
    const pending = this.replyDrafts.get(request.id) ?? {};
    const text = pending.text?.trim() ?? "";
    if (!text) return;
    const id = pending.id ?? foundry.utils.randomID();
    const publicAnswer = request.visibility === "public" && pending.publicAnswer !== false;
    this.replyDrafts.set(request.id, {id, text, publicAnswer});
    this.busy = true; this.render();
    try {
      await this.personal.send({id, kind: "request", rootId: request.id, targetUserId: request.ownerUserId, text});
      const latest = this.transport.requests.get(request.id);
      await this.transport.submit({type: "ANSWER_REQUEST", id: request.id, expectedRevision: latest?.revision, text, publicAnswer});
      this.replyDrafts.delete(request.id); this.replyOpen = null; this.message = "";
    } catch (error) { this.message = errorText(error); }
    finally { this.busy = false; this.render(); }
  }

  async markMessageRead(id) {
    try { await this.personal.markRead(id); }
    catch (error) { this.message = errorText(error); }
    this.render();
  }


  async command(type, request) {
    if (this.busy) return;
    this.busy = true; this.message = ""; this.render();
    try { await this.transport.submit({type, id: request.id, expectedRevision: request.revision}); }
    catch (error) {
      this.message = errorText(error);
      if ((error?.code ?? error?.message) === "conflict") await this.transport.synchronize();
      this.menuOpen = true;
    }
    finally { this.busy = false; this.render(); }
  }

  async clear() {
    const count = this.transport.gmQueue().length;
    if (!count || !(await confirmAction("ConfirmClear", {count}))) return;
    this.busy = true; this.render();
    try { await this.transport.submit({type: "CLEAR_QUEUE"}); }
    catch (error) { this.message = errorText(error); this.menuOpen = true; }
    finally { this.busy = false; this.render(); }
  }

  filtered(requests) {
    if (this.filter === "urgent") return requests.filter(request => request.urgency === "urgent");
    if (this.filter === "normal") return requests.filter(request => request.urgency === "normal");
    if (this.filter === "private") return requests.filter(request => request.visibility === "gm");
    return requests;
  }

  requestRow(request) {
    const urgent = request.urgency === "urgent";
    const thread = this.personal.thread("request", request.id);
    const card = node("article", `rts-request ${urgent ? "rts-request-urgent" : ""} ${this.newIds.has(request.id) ? "rts-request-new" : ""}`);
    const head = node("div", "rts-card-head");
    const kind = node("span", `rts-kind-icon rts-kind-${request.category}`);
    kind.append(icon(["word", "action", "support", "counteraction", "clarification"].includes(request.category) ? request.category : "alert"));
    head.append(kind);
    const text = node("div", "rts-card-text");
    const name = node("strong", "rts-username", userName(request.ownerUserId, this.preferences));
    name.title = name.textContent;
    text.append(name);
    text.append(node("div", `rts-category-name rts-category-${request.category}`, ACTIVE.has(request.status) ? categoryName(request.category) : `${categoryName(request.category)} · ${statusName(request.status)}`));
    if (request.targetUserId) text.append(node("div", "rts-target-line", `${t("TargetShort")}: ${userName(request.targetUserId, this.preferences)}`));
    const note = displayContent(request.note);
    if (note) text.append(node("p", "rts-full-note", note));
    if (request.answer && !thread.some(message => message.text === request.answer && message.senderUserId !== request.ownerUserId)) {
      text.append(node("p", "rts-full-note", `${t("PublicGMAnswer")}: ${displayContent(request.answer)}`));
    }
    head.append(text);
    const flags = node("div", "rts-card-flags");
    if (urgent) flags.append(icon("alert", "rts-flag-urgent"));
    if (request.visibility === "gm") flags.append(icon("lock", "rts-flag-lock"));
    const seen = iconButton(request.status === "pending" ? "eye" : "check", `rts-seen-icon ${request.status === "pending" ? "" : "rts-ack"}`, () => this.command("ACKNOWLEDGE_REQUEST", request), t("Acknowledge"));
    seen.disabled = this.busy || request.status !== "pending";
    flags.append(seen); head.append(flags); card.append(head);
    if (ACTIVE.has(request.status)) {
      const actions = node("div", "rts-gm-actions");
      const floor = button(t("GrantFloor"), "rts-card-button", () => this.command("GRANT_FLOOR", request));
      floor.disabled = this.busy;
      const close = button(t("Close"), "rts-card-button", () => this.command("CLOSE_REQUEST", request));
      close.disabled = this.busy;
      const reply = button(t("Reply"), "rts-card-button", () => {
        this.captureReply(); this.replyOpen = this.replyOpen === request.id ? null : request.id; this.render();
      });
      reply.disabled = this.busy;
      actions.append(floor, close, reply); card.append(actions);
    }
    if (thread.length) {
      const history = node("div", "rts-reply-history");
      for (const message of thread) {
        const line = node("div", `rts-reply-line ${message.targetUserId === game.user.id && message.status === "unread" ? "rts-unread" : ""}`);
        line.append(node("strong", "", userName(message.senderUserId, this.preferences)), node("span", "", displayContent(message.text)));
        if (message.targetUserId === game.user.id && message.status === "unread") line.append(button(t("Acknowledge"), "rts-card-button", () => this.markMessageRead(message.id)));
        history.append(line);
      }
      card.append(history);
    }
    if (ACTIVE.has(request.status) && this.replyOpen === request.id) {
      const form = node("div", "rts-reply-form");
      const input = node("textarea", "rts-request-reply-input");
      input.maxLength = 240; input.rows = 2; input.placeholder = t("ReplyPlaceholder"); input.value = this.replyDrafts.get(request.id)?.text ?? "";
      form.append(input, button(t("SendReply"), "rts-card-button", () => this.sendReply(request)));
      if (request.visibility === "public") {
        const visibility = node("label", "rts-reply-public");
        const checkbox = node("input"); checkbox.type = "checkbox";
        checkbox.checked = this.replyDrafts.get(request.id)?.publicAnswer !== false;
        visibility.append(checkbox, node("span", "", t("PublicAnswerToggle")));
        form.append(visibility);
      }
      card.append(form);
    }
    return card;
  }

  menu() {
    const menu = node("div", "rts-drop-menu");
    menu.append(node("div", "rts-menu-title", t("MenuTitle")));
    const filterLabel = node("label", "rts-menu-filter", t("Filter"));
    const filter = node("select", "rts-filter");
    filter.setAttribute("aria-label", t("Filter"));
    for (const key of ["all", "urgent", "normal", "private"]) {
      const option = node("option", "", t(`FilterValue.${key}`)); option.value = key; filter.append(option);
    }
    filter.value = this.filter;
    filter.addEventListener("change", () => { this.filter = filter.value; this.render(); });
    filterLabel.append(filter); menu.append(filterLabel);
    menu.append(preferenceControls(this.preferences, this.savePreferences, () => this.render()));
    const clear = button(t("ClearQueue"), "rts-menu-button", () => this.clear());
    clear.disabled = this.busy || !this.transport.gmQueue().length;
    clear.prepend(icon("reset")); menu.append(clear);
    const clearLocal = button(t("ClearLocalPrivate"), "rts-menu-button", async () => {
      if (await confirmAction("ConfirmClearLocal")) {
        try { await this.transport.clearPrivateLocal(); }
        catch (error) { this.message = errorText(error); this.render(); }
      }
    });
    clearLocal.prepend(icon("lock")); menu.append(clearLocal);
    if (this.message) menu.append(node("p", "rts-menu-message", this.message));
    if (this.soundHint) menu.append(node("p", "rts-menu-message", this.soundHint));
    if (this.transport.replicationFailures) menu.append(node("p", "rts-menu-message", t("ReplicaWarning", {count: this.transport.replicationFailures})));
    menu.append(node("p", "rts-menu-note", t("BetaNotice")));
    return menu;
  }

  render() {
    this.captureReply();
    const collapsed = this.preferences.gmCollapsed;
    const all = this.transport.gmQueue();
    const requests = this.filtered(all);
    this.element.classList.toggle("rts-collapsed", collapsed);
    this.element.classList.toggle("rts-reduced", this.preferences.reduceMotion);
    this.element.replaceChildren();
    const header = node("div", "rts-header");
    if (collapsed) {
      const compact = button("", "rts-compact-button", () => { this.preferences.gmCollapsed = false; this.savePreferences(); this.render(); }, t("Expand"));
      compact.append(icon("hand"));
      const badge = all.filter(request => request.status === "pending").length + this.personal.unreadCount();
      if (badge) compact.append(node("span", "rts-compact-count", badge > 99 ? "99+" : String(badge)));
      if (all.some(request => request.urgency === "urgent" && request.status === "pending")) compact.classList.add("rts-compact-urgent");
      header.append(compact);
    } else header.append(icon("users", "rts-header-symbol"), node("strong", "rts-heading", t("GMTitle")), node("span", "rts-count", String(all.length)), node("span", "rts-spacer"));
    if (!collapsed) header.append(iconButton("more", "rts-icon-button rts-menu-toggle", () => { this.menuOpen = !this.menuOpen; this.render(); }, t("Menu")));
    if (!collapsed) header.append(iconButton("minus", "rts-icon-button rts-collapse", () => {
      this.preferences.gmCollapsed = !collapsed; this.savePreferences(); this.render();
    }, t("Collapse")));
    this.element.append(header);
    makeDraggable(this.element, header, this.preferences, this.savePreferences, "gmX", "gmY");
    if (!collapsed) {
      if (this.menuOpen) this.element.append(this.menu());
      const body = node("div", "rts-body");
      if (requests.length) {
        for (const request of requests) body.append(this.requestRow(request));
      } else body.append(node("div", "rts-empty", t("NoRequests")));
      const completed = [...this.transport.requests.values()].filter(request => !ACTIVE.has(request.status))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      if (completed.length) {
        body.append(button(t("CompletedHistory"), "rts-link-button", () => { this.historyOpen = !this.historyOpen; this.render(); }));
        if (this.historyOpen) {
          body.append(node("div", "rts-kind-label", t("CompletedHistory")));
          for (const request of completed) body.append(this.requestRow(request));
        }
      }
      if (this.soundHint) body.append(node("p", "rts-message", this.soundHint));
      this.element.append(body);
    }
    this.position();
  }
}
