import {applyPanelPosition, button, categoryName, confirmAction, errorText, iconButton, makeDraggable, node, preferenceControls, statusName, t, userName} from "./dom.js";
import {icon} from "./icons.js";
import {playSound} from "./sound.js";
import {displayContent} from "./display.js";

export class GMPanel {
  constructor(transport, preferences, savePreferences) {
    this.transport = transport;
    this.preferences = preferences;
    this.savePreferences = savePreferences;
    this.filter = "all";
    this.newIds = new Set();
    this.menuOpen = false;
    this.message = "";
    this.busy = false;
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
    void playSound(request.urgency === "urgent" ? "urgent" : "word", this.preferences);
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
    const card = node("article", `rts-request ${urgent ? "rts-request-urgent" : ""} ${this.newIds.has(request.id) ? "rts-request-new" : ""}`);
    const head = node("div", "rts-card-head");
    const kind = node("span", `rts-kind-icon rts-kind-${request.category}`);
    kind.append(icon(["word", "action", "support", "counteraction", "clarification"].includes(request.category) ? request.category : "alert"));
    head.append(kind);
    const text = node("div", "rts-card-text");
    const name = node("strong", "rts-username", userName(request.ownerUserId, this.preferences));
    name.title = name.textContent;
    text.append(name);
    text.append(node("div", `rts-category-name rts-category-${request.category}`, request.status === "floor" ? statusName("floor") : categoryName(request.category)));
    if (request.targetUserId) text.append(node("div", "rts-target-line", `${t("TargetShort")}: ${userName(request.targetUserId, this.preferences)}`));
    const note = displayContent(request.note);
    if (note) text.append(node("p", "rts-full-note", note));
    head.append(text);
    const flags = node("div", "rts-card-flags");
    if (urgent) flags.append(icon("alert", "rts-flag-urgent"));
    if (request.visibility === "gm") flags.append(icon("lock", "rts-flag-lock"));
    const seen = iconButton(request.status === "pending" ? "eye" : "check", `rts-seen-icon ${request.status === "pending" ? "" : "rts-ack"}`, () => this.command("ACKNOWLEDGE_REQUEST", request), t("Acknowledge"));
    seen.disabled = this.busy || request.status !== "pending";
    flags.append(seen); head.append(flags); card.append(head);
    const actions = node("div", "rts-gm-actions");
    const floor = button(request.status === "floor" ? t("FloorGiven") : t("GrantFloor"), `rts-card-button ${request.status === "floor" ? "rts-floor-active" : ""}`, () => this.command("GRANT_FLOOR", request));
    floor.disabled = this.busy || request.status === "floor";
    const close = button(t("Close"), "rts-card-button", () => this.command("CLOSE_REQUEST", request));
    close.disabled = this.busy;
    actions.append(floor, close); card.append(actions);
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
    if (this.transport.replicationFailures) menu.append(node("p", "rts-menu-message", t("ReplicaWarning", {count: this.transport.replicationFailures})));
    menu.append(node("p", "rts-menu-note", t("BetaNotice")));
    return menu;
  }

  render() {
    const collapsed = this.preferences.gmCollapsed;
    const all = this.transport.gmQueue();
    const requests = this.filtered(all);
    this.element.classList.toggle("rts-collapsed", collapsed);
    this.element.classList.toggle("rts-reduced", this.preferences.reduceMotion);
    this.element.replaceChildren();
    const header = node("div", "rts-header");
    header.append(icon("users", "rts-header-symbol"), node("strong", "rts-heading", t("GMTitle")), node("span", "rts-count", String(all.length)), node("span", "rts-spacer"));
    if (!collapsed) header.append(iconButton("more", "rts-icon-button rts-menu-toggle", () => { this.menuOpen = !this.menuOpen; this.render(); }, t("Menu")));
    header.append(iconButton(collapsed ? "plus" : "minus", "rts-icon-button rts-collapse", () => {
      this.preferences.gmCollapsed = !collapsed; this.savePreferences(); this.render();
    }, collapsed ? t("Expand") : t("Collapse")));
    this.element.append(header);
    makeDraggable(this.element, header, this.preferences, this.savePreferences, "gmX", "gmY");
    if (!collapsed) {
      if (this.menuOpen) this.element.append(this.menu());
      const body = node("div", "rts-body");
      if (requests.length) {
        for (const request of requests) body.append(this.requestRow(request));
      } else body.append(node("div", "rts-empty", t("NoRequests")));
      this.element.append(body);
    }
    this.position();
  }
}
