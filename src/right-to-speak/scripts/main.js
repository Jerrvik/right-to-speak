import {RTSTransport} from "./core/transport.js";
import {isGM} from "./core/privacy.js";
import {MODULE_ID} from "./core/request-model.js";
import {loadPreferences, registerSettings, savePreferences} from "./core/settings.js";
import {GMPanel} from "./ui/gm-panel.js";
import {PlayerPanel} from "./ui/player-panel.js";

let playerPanel;
let gmPanel;
let transport;

Hooks.once("init", () => {
  registerSettings();
  transport = new RTSTransport(event => {
    playerPanel?.render();
    gmPanel?.render();
    if (event?.urgent) gmPanel?.pulse();
  });
  RTSTransport.registerQueries(transport);
});

Hooks.once("ready", async () => {
  const preferences = loadPreferences(game.world.id, game.user.id);
  const save = () => savePreferences(game.world.id, game.user.id, preferences);
  await transport.start();
  if (isGM(game.user)) gmPanel = new GMPanel(transport, preferences, save);
  else playerPanel = new PlayerPanel(transport, preferences, save);
  Hooks.on("updateSetting", setting => {
    if (setting.key === `${MODULE_ID}.publicQueue`) {
      transport.mergePublicFromSetting();
      playerPanel?.notifyPublicUrgent();
    }
    playerPanel?.render();
    gmPanel?.render();
  });
  Hooks.on("userConnected", () => { void transport.onUsersChanged(); });
  Hooks.on("updateUser", () => { void transport.onUsersChanged(); });
  window.addEventListener("online", () => { void transport.synchronize(); });
  game.socket.on("connect", () => { void transport.synchronize(); });
  void transport.onUsersChanged();
});
