import test from "node:test";
import assert from "node:assert/strict";
import {RTSTransport} from "../../src/right-to-speak/scripts/core/transport.js";

const gm = {id: "gm", role: 4, active: true, hasPermission: () => true};
const alice = {id: "alice", role: 1, active: false, hasPermission: () => true};
const bob = {id: "bob", role: 1, active: true, hasPermission: () => true, received: [], query: async (...args) => { bob.received.push(args); return {ok: true}; }};

function fixture() {
  bob.received = [];
  const users = [gm, alice, bob];
  users.get = id => users.find(user => user.id === id);
  const values = new Map([
    ["publicQueue", {revision: 0, requests: []}],
    ["historyLimit", 20], ["createCooldown", 0], ["escalateCooldown", 10], ["showPublicQueue", true]
  ]);
  globalThis.game = {
    world: {id: "world"}, user: gm, users, time: {serverTime: Date.parse("2026-10-09T12:00:00Z")},
    settings: {get: (_module, key) => values.get(key), set: async (_module, key, value) => { values.set(key, value); return value; }}
  };
  const storage = {saved: [], loadLocal: async () => [], saveLocal: async (_world, _user, requests) => {storage.saved.push(structuredClone(requests));}, clearLocal: async () => {}};
  const transport = new RTSTransport(() => {}, storage);
  transport.worldId = "world"; transport.userId = gm.id; transport.privateReady = true;
  return {transport, values, storage};
}

test("idempotent public create stores only public projection", async () => {
  const {transport, values} = fixture();
  const command = {type: "CREATE_REQUEST", draft: {id: "requestA123", urgency: "urgent", category: "intervention", visibility: "public", targetUserId: null, note: "secret note"}};
  const first = await transport.applyCommand(command, alice);
  const duplicate = await transport.applyCommand(command, alice);
  assert.equal(first.request.id, duplicate.request.id);
  assert.equal(duplicate.duplicate, true);
  assert.equal(transport.gmQueue().length, 1);
  assert.equal(values.get("publicQueue").revision, 1);
  assert.equal(JSON.stringify(values.get("publicQueue")).includes("secret note"), false);
});

test("private create and status changes leave public setting untouched", async () => {
  const {transport, values, storage} = fixture();
  const command = {type: "CREATE_REQUEST", draft: {id: "secretA123", urgency: "urgent", category: "counteraction", visibility: "gm", targetUserId: "bob", note: "secret note"}};
  const created = await transport.applyCommand(command, alice);
  assert.equal(values.get("publicQueue").revision, 0);
  assert.equal(storage.saved.length, 1);
  assert.equal(created.request.targetUserId, "bob");
  assert.equal(bob.received.length, 0);
  const acknowledged = await transport.applyCommand({type: "ACKNOWLEDGE_REQUEST", id: created.request.id, expectedRevision: 1}, gm);
  assert.equal(acknowledged.request.status, "acknowledged");
  assert.equal(values.get("publicQueue").revision, 0);
  assert.equal(bob.received.length, 0);
  await assert.rejects(transport.applyCommand({type: "ACKNOWLEDGE_REQUEST", id: created.request.id, expectedRevision: 1}, bob), {code: "forbidden"});
});

test("forged GM field in player command is ignored", async () => {
  const {transport} = fixture();
  await transport.applyCommand({type: "CREATE_REQUEST", draft: {id: "publicA123", urgency: "normal", category: "word", visibility: "public", targetUserId: null, note: ""}}, alice);
  await assert.rejects(transport.applyCommand({type: "ACKNOWLEDGE_REQUEST", id: "publicA123", expectedRevision: 1, isGM: true}, bob), {code: "forbidden"});
});

test("private storage failure rejects before acknowledgment", async () => {
  const {transport, values, storage} = fixture();
  storage.saveLocal = async () => { throw new Error("quota"); };
  await assert.rejects(transport.applyCommand({type: "CREATE_REQUEST", draft: {id: "secretA123", urgency: "normal", category: "word", visibility: "gm", targetUserId: null, note: "private"}}, alice), {code: "storageUnavailable"});
  assert.equal(transport.requests.size, 0);
  assert.equal(values.get("publicQueue").revision, 0);
  assert.equal(transport.privateReady, false);
});

test("private to public publishes only a redacted projection", async () => {
  const {transport, values} = fixture();
  await transport.applyCommand({type: "CREATE_REQUEST", draft: {id: "secretA123", urgency: "normal", category: "word", visibility: "gm", targetUserId: null, note: "private details"}}, alice);
  await transport.applyCommand({type: "SET_VISIBILITY", id: "secretA123", visibility: "public", expectedRevision: 1}, alice);
  assert.equal(values.get("publicQueue").requests.length, 1);
  assert.equal(JSON.stringify(values.get("publicQueue")).includes("private details"), false);
  await transport.applyCommand({type: "SET_VISIBILITY", id: "secretA123", visibility: "gm", expectedRevision: 2}, alice);
  assert.equal(values.get("publicQueue").requests.length, 0);
});

test("private requests do not create gaps in public order or public revisions", async () => {
  const {transport, values} = fixture();
  await transport.applyCommand({type: "CREATE_REQUEST", draft: {id: "secretA123", urgency: "normal", category: "word", visibility: "gm", targetUserId: null, note: "secret"}}, alice);
  assert.equal(values.get("publicQueue").revision, 0);
  await transport.applyCommand({type: "CREATE_REQUEST", draft: {id: "publicB123", urgency: "normal", category: "word", visibility: "public", targetUserId: null, note: ""}}, bob);
  assert.equal(values.get("publicQueue").requests[0].order, 1);
  assert.equal(values.get("publicQueue").revision, 1);
});

test("editing a private note on a public request creates no public event", async () => {
  const {transport, values} = fixture();
  await transport.applyCommand({type: "CREATE_REQUEST", draft: {id: "publicA123", urgency: "normal", category: "word", visibility: "public", targetUserId: null, note: ""}}, alice);
  const before = structuredClone(values.get("publicQueue"));
  await transport.applyCommand({type: "UPDATE_REQUEST", id: "publicA123", expectedRevision: 1, category: "word", targetUserId: null, note: "quiet detail"}, alice);
  assert.deepEqual(values.get("publicQueue"), before);
});

test("idempotency key remains spent after terminal history is trimmed", async () => {
  const {transport, values} = fixture();
  values.set("historyLimit", 0);
  const create = {type: "CREATE_REQUEST", draft: {id: "requestA123", urgency: "normal", category: "word", visibility: "public", targetUserId: null, note: ""}};
  await transport.applyCommand(create, alice);
  await transport.applyCommand({type: "CLOSE_REQUEST", id: "requestA123", expectedRevision: 1}, gm);
  assert.equal(transport.requests.size, 0);
  const duplicate = await transport.applyCommand(create, alice);
  assert.equal(duplicate.terminal, true);
  assert.equal(transport.requests.size, 0);
});
