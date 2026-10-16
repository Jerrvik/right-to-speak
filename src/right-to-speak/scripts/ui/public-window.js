import {ACTIVE, sortQueue} from "../core/request-model.js";
import {applyPanelPosition, button, categoryName, iconButton, makeDraggable, node, statusName, t, userName} from "./dom.js";
import {displayContent} from "./display.js";
import {icon} from "./icons.js";

export class PublicWindow {
  constructor(transport, preferences, savePreferences) {
    this.transport = transport;
    this.preferences = preferences;
    this.savePreferences = savePreferences;
    this.historyOpen = false;
    this.element = node("section", "rts-panel rts-public-window");
    this.element.setAttribute("aria-label", t("PublicRequestsTitle"));
    document.body.append(this.element);
    this.render();
    window.addEventListener("resize", () => this.position());
  }

  position() {
    if (this.preferences.publicOpen) {
      applyPanelPosition(this.element, this.preferences, "publicX", "publicY", () => 500, () => 105);
    }
  }

  toggle() {
    this.preferences.publicOpen = !this.preferences.publicOpen;
    this.savePreferences();
    this.render();
  }

  requestRow(request) {
    const card = node("article", "rts-public-request");
    const head = node("div", "rts-public-request-head");
    head.append(node("strong", "rts-username", userName(request.ownerUserId, this.preferences)));
    head.append(node("span", `rts-status-pill rts-status-${request.status}`, statusName(request.status)));
    card.append(head, node("div", "rts-category-name", categoryName(request.category)));
    if (request.note) card.append(node("p", "rts-public-note", displayContent(request.note)));
    if (request.answer) {
      const answer = node("div", "rts-public-answer");
      answer.append(node("strong", "", t("PublicGMAnswer")), node("p", "", displayContent(request.answer)));
      card.append(answer);
    }
    return card;
  }

  render() {
    const open = this.preferences.publicOpen;
    this.element.hidden = !open;
    if (!open) return;
    const collapsed = this.preferences.publicCollapsed;
    const visible = this.transport.visiblePublic();
    const active = sortQueue(visible);
    const completed = visible.filter(request => !ACTIVE.has(request.status))
      .sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt));
    this.element.classList.toggle("rts-collapsed", collapsed);
    this.element.classList.toggle("rts-reduced", this.preferences.reduceMotion);
    this.element.replaceChildren();
    const header = node("div", "rts-header");
    if (collapsed) {
      const compact = button("", "rts-compact-button", () => {
        this.preferences.publicCollapsed = false; this.savePreferences(); this.render();
      }, t("Expand"));
      compact.append(icon("users"));
      if (active.length) compact.append(node("span", "rts-compact-count", String(active.length)));
      header.append(compact);
    } else {
      header.append(icon("users", "rts-header-symbol"), node("strong", "rts-heading", t("PublicRequestsTitle")),
        node("span", "rts-count", String(active.length)), node("span", "rts-spacer"));
      header.append(iconButton("minus", "rts-icon-button", () => {
        this.preferences.publicCollapsed = true; this.savePreferences(); this.render();
      }, t("Collapse")));
      header.append(iconButton("close", "rts-icon-button", () => this.toggle(), t("CloseWindow")));
    }
    this.element.append(header);
    makeDraggable(this.element, header, this.preferences, this.savePreferences, "publicX", "publicY");
    if (!collapsed) {
      const body = node("div", "rts-body");
      if (active.length) for (const request of active) body.append(this.requestRow(request));
      else body.append(node("p", "rts-empty", t("NoPublicRequests")));
      const history = button(`${t("CompletedHistory")} (${completed.length})`, "rts-link-button", () => {
        this.historyOpen = !this.historyOpen; this.render();
      });
      history.setAttribute("aria-expanded", String(this.historyOpen));
      body.append(history);
      if (this.historyOpen) {
        if (completed.length) for (const request of completed) body.append(this.requestRow(request));
        else body.append(node("p", "rts-empty", t("NoCompletedRequests")));
      }
      this.element.append(body);
    }
    this.position();
  }
}
