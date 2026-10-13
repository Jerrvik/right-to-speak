import {icon} from "./icons.js";
import {displayUserName} from "./display.js";

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

export function iconButton(name, className, callback, title) {
  const control = button("", className, callback, title);
  control.setAttribute("aria-label", title);
  control.append(icon(name));
  return control;
}

export function iconLabel(name, label) {
  const wrapper = node("span", "rts-icon-label");
  wrapper.append(icon(name, "rts-ico-lg"), node("span", "rts-label", label));
  return wrapper;
}

export function userName(id, preferences) {
  return displayUserName(game.users.get(id), preferences?.nameDisplay, t("UnknownUser"));
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

export function preferenceControls(preferences, savePreferences, rerender) {
  const group = node("div", "rts-preferences");
  const toggle = (label, checked, change) => {
    const row = node("label", "rts-option");
    const input = node("input"); input.type = "checkbox"; input.checked = checked;
    input.addEventListener("change", () => change(input.checked));
    row.append(input, node("span", "", label));
    return row;
  };
  const nameRow = node("label", "rts-name-preference");
  nameRow.append(node("span", "", t("NameDisplay")));
  const nameSelect = node("select", "rts-name-mode");
  for (const mode of ["player", "character"]) {
    const option = node("option", "", t(`NameDisplayValue.${mode}`));
    option.value = mode;
    nameSelect.append(option);
  }
  nameSelect.value = preferences.nameDisplay === "character" ? "character" : "player";
  nameSelect.addEventListener("change", () => {
    preferences.nameDisplay = nameSelect.value;
    savePreferences();
    rerender();
  });
  nameRow.append(nameSelect);
  group.append(nameRow);
  group.append(toggle(t("Sound"), preferences.sound, value => { preferences.sound = value; savePreferences(); }));
  const volume = node("label", "rts-volume-label");
  volume.append(node("span", "", t("Volume")));
  const slider = node("input", "rts-volume"); slider.type = "range"; slider.min = "0"; slider.max = "100";
  slider.value = String(Math.round(preferences.volume * 100));
  slider.addEventListener("input", () => { preferences.volume = Number(slider.value) / 100; savePreferences(); });
  volume.append(slider);
  group.append(volume);
  const types = node("div", "rts-sound-types");
  for (const type of ["word", "urgent", "personal", "floor"]) {
    types.append(toggle(t(`SoundType.${type}`), preferences.soundTypes[type], value => {
      preferences.soundTypes[type] = value; savePreferences();
    }));
  }
  group.append(types);
  group.append(toggle(t("ReduceMotion"), preferences.reduceMotion, value => {
    preferences.reduceMotion = value; savePreferences(); rerender();
  }));
  return group;
}

export function applyPanelPosition(element, preferences, xKey, yKey, initialX, initialY) {
  const margin = 10;
  const x = preferences[xKey] ?? initialX();
  const y = preferences[yKey] ?? initialY();
  element.style.left = `${Math.max(margin, Math.min(x, Math.max(margin, window.innerWidth - element.offsetWidth - margin)))}px`;
  element.style.top = `${Math.max(margin, Math.min(y, Math.max(margin, window.innerHeight - element.offsetHeight - margin)))}px`;
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
