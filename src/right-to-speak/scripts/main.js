import {RTSTransport} from "./core/transport.js";
import {PersonalTransport} from "./core/personal.js";
import {isGM} from "./core/privacy.js";
import {MODULE_ID} from "./core/request-model.js";
import {loadPreferences, registerSettings, savePreferences} from "./core/settings.js";
import {GMPanel} from "./ui/gm-panel.js";
import {PlayerPanel} from "./ui/player-panel.js";
import {directedQueries} from "./core/directed-query.js";

let playerPanel;
let gmPanel;
let transport;
let personal;

Hooks.once("init", () => {
  registerSettings();
  directedQueries.registerVerifier();
  transport = new RTSTransport(event => {
    playerPanel?.render();
    gmPanel?.render();
    if (event?.arrival) gmPanel?.notifyArrival(event.arrival);
  });
  personal = new PersonalTransport(event => {
    playerPanel?.render();
    gmPanel?.render();
    if (event?.personalIncoming) {
      playerPanel?.notifyPersonal(event.personalIncoming);
      gmPanel?.notifyMessage(event.personalIncoming);
    }
  }, undefined, transport);
  RTSTransport.registerQueries(transport);
  PersonalTransport.registerQueries(personal);
});

Hooks.once("ready", async () => {
  const preferences = loadPreferences(game.world.id, game.user.id);
  const save = () => savePreferences(game.world.id, game.user.id, preferences);
  await transport.start();
  await personal.start();
  if (isGM(game.user)) gmPanel = new GMPanel(transport, personal, preferences, save);
  else playerPanel = new PlayerPanel(transport, personal, preferences, save);
  Hooks.on("updateSetting", setting => {
    if (setting.key === `${MODULE_ID}.publicQueue`) {
      transport.mergePublicFromSetting();
    }
    playerPanel?.render();
    gmPanel?.render();
  });
  Hooks.on("userConnected", () => { void transport.onUsersChanged(); void personal.synchronize(); });
  Hooks.on("updateUser", () => { void transport.onUsersChanged(); void personal.synchronize(); });
  window.addEventListener("online", () => { void transport.synchronize(); void personal.synchronize(); });
  game.socket.on("connect", () => { void transport.synchronize(); void personal.synchronize(); });
  void transport.onUsersChanged();
});
