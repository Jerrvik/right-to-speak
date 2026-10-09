export function t(key, data = {}) { return game.i18n.format(`RTS.${key}`, data); }

export function node(tag, className = "", value = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== null) element.textContent = String(value);
  return element;
}

export function button(label, className, callback, title = label) {
  const element = node("button", className, label);
  element.type = "button";
  element.title = title;
  element.addEventListener("click", callback);
  return element;
}

export function iconLabel(icon, label) {
  const wrapper = node("span", "rts-icon-label");
  const iconNode = node("span", "rts-icon", icon);
  iconNode.setAttribute("aria-hidden", "true");
  wrapper.append(iconNode, node("span", "rts-label", label));
  return wrapper;
}

export function userName(id) {
  return game.users.get(id)?.name ?? t("UnknownUser");
}

export function categoryName(category) { return t(`Category.${category}`); }
export function statusName(status) { return t(`Status.${status}`); }
export function statusWithIcon(status) {
  const icons = {pending: "◷", acknowledged: "✓", floor: "★", closed: "✓", cancelled: "×"};
  return `${icons[status] ?? "•"} ${statusName(status)}`;
}

export async function confirmAction(key, data = {}) {
  return !!(await foundry.applications.api.DialogV2.confirm({
    window: {title: t("ConfirmTitle")},
    content: `<p>${t(key, data)}</p>`
  }));
}

export function errorText(error) {
  const code = error?.code ?? error?.message ?? "unknown";
  const key = `Error.${code}`;
  return game.i18n.has(`RTS.${key}`) ? t(key) : t("Error.unknown");
}

export function applyPanelPosition(element, preferences, xKey, yKey, initialX, initialY) {
  const margin = 10;
  const x = preferences[xKey] ?? initialX();
  const y = preferences[yKey] ?? initialY();
  element.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - element.offsetWidth - margin))}px`;
  element.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - element.offsetHeight - margin))}px`;
}

export function makeDraggable(element, handle, preferences, savePreferences, xKey, yKey) {
  handle.tabIndex = 0;
  handle.setAttribute("aria-label", t("MovePanel"));
  handle.addEventListener("keydown", event => {
    const delta = {ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10]}[event.key];
    if (!delta || event.target !== handle) return;
    event.preventDefault();
    const maxX = Math.max(10, window.innerWidth - element.offsetWidth - 10);
    const maxY = Math.max(10, window.innerHeight - element.offsetHeight - 10);
    preferences[xKey] = Math.max(10, Math.min(maxX, element.offsetLeft + delta[0]));
    preferences[yKey] = Math.max(10, Math.min(maxY, element.offsetTop + delta[1]));
    element.style.left = `${preferences[xKey]}px`;
    element.style.top = `${preferences[yKey]}px`;
    savePreferences();
  });
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button,input,select")) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = element.offsetLeft;
    const originY = element.offsetTop;
    const move = current => {
      const maxX = Math.max(10, window.innerWidth - element.offsetWidth - 10);
      const maxY = Math.max(10, window.innerHeight - element.offsetHeight - 10);
      element.style.left = `${Math.max(10, Math.min(maxX, originX + current.clientX - startX))}px`;
      element.style.top = `${Math.max(10, Math.min(maxY, originY + current.clientY - startY))}px`;
    };
    const up = current => {
      move(current);
      preferences[xKey] = element.offsetLeft;
      preferences[yKey] = element.offsetTop;
      savePreferences();
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
}
