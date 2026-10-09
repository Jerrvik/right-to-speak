import {MODULE_ID} from "./request-model.js";

export function registerSettings() {
  const settings = [
    ["publicQueue", {name: "Public queue", scope: "world", config: false, type: Object, default: {revision: 0, requests: []}}],
    ["showPublicQueue", {name: "RTS.Settings.ShowPublicQueue", hint: "RTS.Settings.ShowPublicQueueHint", scope: "world", config: true, type: Boolean, default: true}],
    ["historyLimit", {name: "RTS.Settings.HistoryLimit", scope: "world", config: true, type: Number, default: 20, range: {min: 0, max: 100, step: 1}}],
    ["createCooldown", {name: "RTS.Settings.CreateCooldown", scope: "world", config: true, type: Number, default: 3, range: {min: 0, max: 30, step: 1}}],
    ["escalateCooldown", {name: "RTS.Settings.EscalateCooldown", scope: "world", config: true, type: Number, default: 10, range: {min: 0, max: 60, step: 1}}],
    ["allowSound", {name: "RTS.Settings.AllowSound", scope: "world", config: true, type: Boolean, default: false}]
  ];
  for (const [key, data] of settings) game.settings.register(MODULE_ID, key, data);
}

export function prefKey(worldId, userId) { return `rts-prefs:${worldId}:${userId}`; }

export function loadPreferences(worldId, userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(prefKey(worldId, userId)) || "{}");
    return {
      x: Number.isFinite(raw.x) ? raw.x : null,
      y: Number.isFinite(raw.y) ? raw.y : null,
      collapsed: !!raw.collapsed,
      private: !!raw.private,
      sound: !!raw.sound,
      reduceMotion: !!raw.reduceMotion,
      gmX: Number.isFinite(raw.gmX) ? raw.gmX : null,
      gmY: Number.isFinite(raw.gmY) ? raw.gmY : null,
      gmCollapsed: !!raw.gmCollapsed
    };
  } catch { return {x: null, y: null, collapsed: false, private: false, sound: false, reduceMotion: false, gmX: null, gmY: null, gmCollapsed: false}; }
}

export function savePreferences(worldId, userId, preferences) {
  try { localStorage.setItem(prefKey(worldId, userId), JSON.stringify(preferences)); } catch { /* Browser storage may be disabled. */ }
}
