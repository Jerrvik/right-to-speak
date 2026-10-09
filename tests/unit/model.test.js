import test from "node:test";
import assert from "node:assert/strict";
import {createRequest, reduceRequest} from "../../src/right-to-speak/scripts/core/reducer.js";
import {publicProjection, publicQueue, canAct, authorizedSnapshot} from "../../src/right-to-speak/scripts/core/privacy.js";
import {sortQueue, validateDraft} from "../../src/right-to-speak/scripts/core/request-model.js";

const gm = {id: "gm", role: 4};
const alice = {id: "alice", role: 1};
const bob = {id: "bob", role: 1};
const ids = [gm.id, alice.id, bob.id];

function request(overrides = {}) {
  const draft = validateDraft({id: "requestA123", urgency: "normal", category: "word", visibility: "public", targetUserId: null, note: "", ...overrides}, alice.id, ids);
  return createRequest(draft, {now: "2026-10-09T12:00:00.000Z", order: 1});
}

const context = actor => ({actor, now: "2026-10-09T12:00:01.000Z", userIds: ids});

test("status transitions and revision conflicts", () => {
  const pending = request();
  const acknowledged = reduceRequest(pending, {type: "ACKNOWLEDGE_REQUEST", expectedRevision: 1}, context(gm));
  assert.equal(acknowledged.status, "acknowledged");
  assert.equal(acknowledged.revision, 2);
  const floor = reduceRequest(acknowledged, {type: "GRANT_FLOOR", expectedRevision: 2}, context(gm));
  assert.equal(floor.status, "floor");
  const closed = reduceRequest(floor, {type: "CLOSE_REQUEST", expectedRevision: 3}, context(gm));
  assert.equal(closed.status, "closed");
  assert.throws(() => reduceRequest(closed, {type: "GRANT_FLOOR", expectedRevision: 4}, context(gm)), {code: "inactiveRequest"});
  assert.throws(() => reduceRequest(acknowledged, {type: "CANCEL_REQUEST", expectedRevision: 1}, context(alice)), {code: "conflict"});
  assert.throws(() => reduceRequest(pending, {type: "ACKNOWLEDGE_REQUEST", expectedRevision: 1}, context(bob)), {code: "forbidden"});
});

test("escalation keeps creation order and allows after-send details", () => {
  const pending = request();
  const urgent = reduceRequest(pending, {type: "ESCALATE", expectedRevision: 1}, context(alice));
  assert.equal(urgent.urgency, "urgent");
  assert.equal(urgent.category, "intervention");
  assert.equal(urgent.order, 1);
  assert.equal(urgent.createdAt, pending.createdAt);
  const detailed = reduceRequest(urgent, {type: "UPDATE_REQUEST", expectedRevision: 2, category: "counteraction", targetUserId: "bob", note: "<img onerror=alert(1)>"}, context(alice));
  assert.equal(detailed.targetUserId, "bob");
  assert.equal(detailed.note, "<img onerror=alert(1)>");
  assert.equal(detailed.revision, 3);
  assert.throws(() => reduceRequest(detailed, {type: "ESCALATE", expectedRevision: 3}, context(alice)), {code: "invalidTransition"});
});

test("validation rejects oversized text and target impersonation", () => {
  assert.throws(() => request({note: "a".repeat(241)}), {code: "invalidNote"});
  assert.throws(() => request({targetUserId: "alice"}), {code: "invalidTarget"});
  assert.throws(() => request({urgency: "normal", category: "action"}), {code: "invalidCategory"});
});

test("queue sorts urgent first then FIFO", () => {
  const normal = request({id: "normalAAA"});
  const urgentOld = {...request({id: "urgentOld", urgency: "urgent", category: "intervention"}), order: 2};
  const urgentNew = {...request({id: "urgentNew", urgency: "urgent", category: "intervention"}), order: 3};
  assert.deepEqual(sortQueue([normal, urgentNew, urgentOld]).map(r => r.id), ["urgentOld", "urgentNew", "normalAAA"]);
});

test("public projection never carries note or private existence", () => {
  const publicRequest = request({note: "GM only note"});
  const secret = request({id: "secretAAA", visibility: "gm", targetUserId: "bob", note: "secret"});
  const projection = publicProjection(publicRequest, 1);
  assert.equal("note" in projection, false);
  assert.equal("visibility" in projection, false);
  assert.equal("revision" in projection, false);
  assert.equal("updatedAt" in projection, false);
  assert.deepEqual(publicQueue([publicRequest, secret]).map(r => r.id), [publicRequest.id]);
  assert.deepEqual(authorizedSnapshot([publicRequest, secret], bob), []);
  assert.deepEqual(authorizedSnapshot([publicRequest, secret], alice).map(r => r.id), [publicRequest.id, secret.id]);
  assert.equal(canAct(bob, secret, "CANCEL_REQUEST"), false);
});
