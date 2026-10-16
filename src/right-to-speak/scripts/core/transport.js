import {ACTIVE, assert, MODULE_ID, RequestError, sortQueue, STATUS, validateDraft, validateStoredRequest} from "./request-model.js";
import {authorizedSnapshot, isGM, publicQueue} from "./privacy.js";
import {createRequest, reduceRequest} from "./reducer.js";
import {loadLocal, saveLocal} from "./storage.js";

const PREFIX = `${MODULE_ID}.`;
const QUERY = {
  command: `${PREFIX}command`,
  snapshot: `${PREFIX}snapshot`,
  deliver: `${PREFIX}deliver`,
  replica: `${PREFIX}replica`,
  health: `${PREFIX}health`
};
const TIMEOUT = 8000;

export function coordinator() {
  return game.users.filter(user => user.active && isGM(user)).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

export function serverNow() {
  const time = game.time?.serverTime;
  if (!Number.isFinite(time)) throw new RequestError("serverTimeUnavailable");
  return new Date(time).toISOString();
}

function userIds() { return game.users.map(user => user.id); }

function currentPublicSetting() {
  const value = game.settings.get(MODULE_ID, "publicQueue");
  return value && Array.isArray(value.requests) ? value : {revision: 0, requests: []};
}

function sanitizedPublicSetting(requests) {
  return {revision: currentPublicSetting().revision + 1, requests: publicQueue(requests)};
}

function trimHistory(requests) {
  const max = Math.max(0, Math.min(100, Number(game.settings.get(MODULE_ID, "historyLimit")) || 0));
  const active = requests.filter(request => ACTIVE.has(request.status));
  const history = requests.filter(request => !ACTIVE.has(request.status)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, max);
  return [...active, ...history];
}

export class RTSTransport {
  constructor(onChange, storage = {loadLocal, saveLocal}) {
    this.onChange = onChange;
    this.requests = new Map();
    this.usedIds = new Map();
    this.own = new Map();
    this.privateReady = false;
    this.ownerStoreReady = false;
    this.storage = storage;
    this.queue = Promise.resolve();
    this.syncTask = null;
    this.worldId = null;
    this.userId = null;
    this.lastCoordinatorId = null;
    this.replicationFailures = 0;
  }

  static registerQueries(instance) {
    CONFIG.queries[QUERY.command] = (data, context) => instance.receiveCommand(data, context);
    CONFIG.queries[QUERY.snapshot] = (data, context) => instance.receiveSnapshot(data, context);
    CONFIG.queries[QUERY.deliver] = (data, context) => instance.receiveDelivery(data, context);
    CONFIG.queries[QUERY.replica] = (data, context) => instance.receiveReplica(data, context);
    CONFIG.queries[QUERY.health] = (_data, context) => instance.receiveHealth(context);
  }

  async start() {
    this.worldId = game.world.id;
    this.userId = game.user.id;
    try {
      const local = await this.storage.loadLocal(this.worldId, this.userId);
      const records = Array.isArray(local) ? local : local.requests;
      if (isGM(game.user)) {
        for (const used of local.usedIds ?? []) {
          if (used && typeof used.id === "string" && typeof used.ownerUserId === "string" && ["gm", "public"].includes(used.visibility)) {
            this.usedIds.set(used.id, used);
          }
        }
        for (const request of records) {
          try {
            this.requests.set(request.id, validateStoredRequest(request, userIds()));
            this.usedIds.set(request.id, {id: request.id, ownerUserId: request.ownerUserId, visibility: request.visibility});
          } catch { /* Ignore damaged local entries. */ }
        }
        this.privateReady = true;
        this.mergePublicFromSetting();
      } else {
        this.ownerStoreReady = true;
        for (const request of records) {
          try {
            validateStoredRequest(request, userIds());
            if (request.ownerUserId === this.userId) this.own.set(request.id, request);
          } catch { /* Ignore damaged local entries. */ }
        }
      }
    } catch {
      this.privateReady = false;
      if (isGM(game.user)) this.mergePublicFromSetting();
    }
    this.lastCoordinatorId = coordinator()?.id ?? null;
    if (isGM(game.user) && this.userId === this.lastCoordinatorId && this.privateReady) {
      try { await this.refreshPublicSetting(); }
      catch { /* A later GM action can publish the migrated projection. */ }
    }
    this.onChange();
    void this.synchronize();
  }

  mergePublicFromSetting() {
    if (!isGM(game.user)) return;
    const entries = currentPublicSetting().requests;
    const present = new Set();
    for (const entry of entries) {
      if (!entry || entry.visibility || !STATUS.has(entry.status)) continue;
      const old = this.requests.get(entry.id);
      if (old?.visibility === "gm") continue;
      const request = {
        id: entry.id, ownerUserId: entry.ownerUserId, urgency: entry.urgency,
        category: entry.category, targetUserId: entry.targetUserId ?? null,
        note: entry.notePublic === true ? entry.note ?? "" : old?.note ?? "",
        notePublic: entry.notePublic === true,
        answer: entry.answerPublic === true ? entry.answer ?? "" : old?.answer ?? "",
        answerPublic: entry.answerPublic === true,
        visibility: "public", status: entry.status, createdAt: entry.createdAt,
        updatedAt: entry.updatedAt ?? old?.updatedAt ?? entry.createdAt,
        order: entry.order, revision: entry.revision ?? old?.revision ?? 1
      };
      try { validateStoredRequest(request, userIds()); }
      catch { continue; }
      present.add(entry.id);
      this.requests.set(entry.id, request);
      this.usedIds.set(entry.id, {id: entry.id, ownerUserId: entry.ownerUserId, visibility: "public"});
    }
    for (const request of this.requests.values()) {
      if (request.visibility === "public" && ACTIVE.has(request.status) && !present.has(request.id)) {
        this.requests.set(request.id, {...request, status: "closed"});
      }
    }
    this.onChange();
  }

  visiblePublic() {
    if (!game.settings.get(MODULE_ID, "showPublicQueue") && !isGM(game.user)) return [];
    return currentPublicSetting().requests.filter(request => request && !request.visibility && STATUS.has(request.status));
  }

  async refreshPublicSetting() {
    const requests = publicQueue(trimHistory([...this.requests.values()]));
    if (JSON.stringify(currentPublicSetting().requests) !== JSON.stringify(requests)) {
      await game.settings.set(MODULE_ID, "publicQueue", sanitizedPublicSetting([...this.requests.values()]));
    }
  }

  activeOwn() {
    const entries = isGM(game.user) ? [...this.requests.values()].filter(r => r.ownerUserId === this.userId) : [...this.own.values()];
    return sortQueue(entries)[0] ?? null;
  }

  latestOwn() {
    const entries = isGM(game.user) ? [...this.requests.values()].filter(r => r.ownerUserId === this.userId) : [...this.own.values()];
    return entries.sort((a, b) => b.order - a.order || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
  }

  gmQueue() { return sortQueue(this.requests.values()); }

  async health() {
    const gm = coordinator();
    if (!gm) return {online: false, privateReady: false};
    if (!game.user.hasPermission("QUERY_USER")) return {online: true, privateReady: false, error: "queryDenied"};
    try { return await gm.query(QUERY.health, {}, {timeout: TIMEOUT}); }
    catch { return {online: true, privateReady: false, error: "deliveryFailed"}; }
  }

  receiveHealth(context) {
    assert(context?.user && game.user.id === coordinator()?.id, "notCoordinator");
    return {online: true, privateReady: this.privateReady};
  }

  async submit(command) {
    const gm = coordinator();
    assert(gm, "gmOffline");
    if (!game.user.hasPermission("QUERY_USER")) throw new RequestError("queryDenied");
    if (command.type === "CREATE_REQUEST" && command.draft?.visibility === "gm" && !isGM(game.user)) {
      assert(this.ownerStoreReady, "privateUnavailable");
    }
    if (command.type === "SET_VISIBILITY" && command.visibility === "gm" && !isGM(game.user)) {
      assert(this.ownerStoreReady, "privateUnavailable");
    }
    const result = gm.id === game.user.id
      ? await this.receiveCommand(command, {user: game.user})
      : await gm.query(QUERY.command, command, {timeout: TIMEOUT});
    if (result?.request?.ownerUserId === this.userId) await this.acceptOwn(result.request);
    this.onChange();
    return result;
  }

  receiveCommand(command, context) {
    assert(game.user.id === coordinator()?.id && isGM(game.user), "notCoordinator");
    assert(context?.user, "unknownSender");
    const task = this.queue.then(() => this.applyCommand(command, context.user));
    this.queue = task.catch(() => {});
    return task;
  }

  async applyCommand(command, actor) {
    assert(command && typeof command === "object" && typeof command.type === "string", "invalidOperation");
    assert(this.privateReady, "storageUnavailable");
    const now = serverNow();
    const before = [...this.requests.values()];
    const usedBefore = [...this.usedIds.values()];
    const usedNext = new Map(this.usedIds);
    let next = [...before];
    let changed = [];
    if (command.type === "CREATE_REQUEST") {
      const draft = validateDraft(command.draft, actor.id, userIds());
      assert(!isGM(actor), "forbidden");
      const same = before.find(r => r.id === draft.id);
      if (same) {
        assert(same.ownerUserId === actor.id, "forbidden");
        return {request: same, duplicate: true};
      }
      if (usedNext.has(draft.id)) {
        assert(usedNext.get(draft.id).ownerUserId === actor.id, "forbidden");
        return {request: null, duplicate: true, terminal: true};
      }
      const active = before.find(r => r.ownerUserId === actor.id && ACTIVE.has(r.status));
      if (active) return {request: active, duplicate: true};
      const cooldown = Number(game.settings.get(MODULE_ID, "createCooldown")) * 1000;
      const last = before.filter(r => r.ownerUserId === actor.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      assert(!last || ["floor", "closed"].includes(last.status) || Date.parse(now) - Date.parse(last.createdAt) >= cooldown, "rateLimited");
      const order = Math.max(usedNext.size, ...before.map(r => r.order), 0) + 1;
      const request = createRequest(draft, {now, order});
      next.push(request);
      usedNext.set(request.id, {id: request.id, ownerUserId: request.ownerUserId, visibility: request.visibility});
      changed = [request];
    } else if (command.type === "CLEAR_QUEUE") {
      assert(isGM(actor), "forbidden");
      next = before.map(r => ACTIVE.has(r.status) ? reduceRequest(r, {type: "CLOSE_REQUEST", expectedRevision: r.revision}, {actor, now, userIds: userIds()}) : r);
      changed = next.filter((r, i) => r !== before[i]);
    } else {
      const existing = before.find(r => r.id === command.id);
      assert(existing, "notFound");
      if (command.type === "ESCALATE" || command.type === "ESCALATE_WITH_DETAILS") {
        const cooldown = Math.max(0, Number(game.settings.get(MODULE_ID, "escalateCooldown")) || 0) * 1000;
        const priorUrgent = before.filter(r => r.ownerUserId === actor.id && r.id !== existing.id && r.urgency === "urgent")
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        assert(!priorUrgent || Date.parse(now) - Date.parse(priorUrgent.createdAt) >= cooldown, "rateLimited");
      }
      const update = reduceRequest(existing, command, {actor, now, userIds: userIds()});
      next = before.map(r => r.id === update.id ? update : r);
      usedNext.set(update.id, {id: update.id, ownerUserId: update.ownerUserId, visibility: update.visibility});
      changed = [update];
    }
    next = trimHistory(next);
    const publicBefore = JSON.stringify(publicQueue(before));
    const publicAfter = JSON.stringify(publicQueue(next));
    const publicChanged = publicBefore !== publicAfter;
    try { await this.storage.saveLocal(this.worldId, this.userId, next, [...usedNext.values()]); }
    catch { this.privateReady = false; throw new RequestError("storageUnavailable"); }
    // Keep the full GM record visible while the public setting update notifies clients.
    // The setting contains a redacted projection and must never replace its note.
    this.requests = new Map(next.map(r => [r.id, r]));
    this.usedIds = usedNext;
    if (publicChanged) {
      try { await game.settings.set(MODULE_ID, "publicQueue", sanitizedPublicSetting(next)); }
      catch (error) {
        try { await this.storage.saveLocal(this.worldId, this.userId, before, usedBefore); }
        catch { this.privateReady = false; }
        this.requests = new Map(before.map(r => [r.id, r]));
        this.usedIds = new Map(usedBefore.map(r => [r.id, r]));
        throw error;
      }
    }
    this.onChange({arrival: changed.length === 1 && changed[0].revision === 1 ? changed[0] : null});
    void Promise.allSettled(changed.flatMap(r => [this.deliverToOwner(r), this.replicateToGMs(r)]));
    return {request: changed.length === 1 ? changed[0] : null, count: changed.length};
  }

  async deliverToOwner(request) {
    const owner = game.users.get(request.ownerUserId);
    if (!owner?.active) return;
    if (owner.id === game.user.id) return this.acceptOwn(request);
    await owner.query(QUERY.deliver, {request}, {timeout: TIMEOUT});
  }

  async replicateToGMs(request) {
    const others = game.users.filter(user => user.active && isGM(user) && user.id !== game.user.id);
    const results = await Promise.allSettled(others.map(user => user.query(QUERY.replica, {request}, {timeout: TIMEOUT})));
    const failures = results.filter(result => result.status === "rejected").length;
    if (this.replicationFailures !== failures) {
      this.replicationFailures = failures;
      this.onChange();
    }
  }

  async acceptOwn(request) {
    assert(request.ownerUserId === this.userId, "forbidden");
    const old = this.own.get(request.id);
    if (!old || old.revision <= request.revision) this.own.set(request.id, request);
    this.own = new Map(trimHistory([...this.own.values()]).map(r => [r.id, r]));
    try { await this.storage.saveLocal(this.worldId, this.userId, [...this.own.values()]); }
    catch {
      this.ownerStoreReady = false;
      if (request.visibility === "gm") throw new RequestError("privateUnavailable");
    }
    this.onChange();
  }

  async receiveDelivery(data, context) {
    assert(isGM(context?.user), "forbidden");
    assert(data?.request?.ownerUserId === game.user.id, "forbidden");
    await this.acceptOwn(data.request);
    return {ok: true};
  }

  async receiveReplica(data, context) {
    assert(isGM(game.user) && isGM(context?.user) && context.user.id === coordinator()?.id, "forbidden");
    assert(this.privateReady, "storageUnavailable");
    const request = validateStoredRequest(data?.request, userIds());
    const old = this.requests.get(request.id);
    if (!old || old.revision < request.revision) {
      const next = trimHistory([...this.requests.values()].filter(r => r.id !== request.id).concat(request));
      const usedNext = new Map(this.usedIds);
      usedNext.set(request.id, {id: request.id, ownerUserId: request.ownerUserId, visibility: request.visibility});
      await this.storage.saveLocal(this.worldId, this.userId, next, [...usedNext.values()]);
      this.requests = new Map(next.map(r => [r.id, r]));
      this.usedIds = usedNext;
      this.onChange({arrival: request.revision === 1 ? request : null});
    }
    return {ok: true};
  }

  receiveSnapshot(_data, context) {
    assert(game.user.id === coordinator()?.id && isGM(game.user), "notCoordinator");
    assert(context?.user, "unknownSender");
    return {
      requests: authorizedSnapshot([...this.requests.values()], context.user),
      ...(isGM(context.user) ? {usedIds: [...this.usedIds.values()]} : {})
    };
  }

  async synchronize() {
    if (this.syncTask) return this.syncTask;
    this.syncTask = this.performSynchronize().finally(() => { this.syncTask = null; });
    return this.syncTask;
  }

  async performSynchronize() {
    const gm = coordinator();
    if (!gm || gm.id === game.user.id) return;
    try {
      const snapshot = await gm.query(QUERY.snapshot, {}, {timeout: TIMEOUT});
      if (!Array.isArray(snapshot?.requests)) return;
      if (isGM(game.user)) {
        if (!this.privateReady) return;
        for (const used of snapshot.usedIds ?? []) {
          if (used && typeof used.id === "string" && typeof used.ownerUserId === "string" && ["gm", "public"].includes(used.visibility)) {
            this.usedIds.set(used.id, used);
          }
        }
        for (const request of snapshot.requests) {
          const old = this.requests.get(request.id);
          if (!old || old.revision < request.revision) this.requests.set(request.id, request);
          this.usedIds.set(request.id, {id: request.id, ownerUserId: request.ownerUserId, visibility: request.visibility});
        }
        await this.storage.saveLocal(this.worldId, this.userId, [...this.requests.values()], [...this.usedIds.values()]);
      } else {
        for (const request of snapshot.requests) await this.acceptOwn(request);
        const missing = [...this.own.values()].filter(r => r.visibility === "gm" && ACTIVE.has(r.status) && !snapshot.requests.some(s => s.id === r.id));
        for (const request of missing) {
          try {
            await this.submit({type: "CREATE_REQUEST", draft: {
              id: request.id, urgency: request.urgency, category: request.category,
              targetUserId: request.targetUserId, note: request.note, visibility: request.visibility
            }});
          } catch { /* Keep local request for explicit retry. */ }
        }
      }
      this.onChange();
    } catch { /* A later reconnect can retry. */ }
  }

  async onUsersChanged() {
    const id = coordinator()?.id ?? null;
    if (id !== this.lastCoordinatorId) {
      this.lastCoordinatorId = id;
      if (id === game.user.id && isGM(game.user)) this.mergePublicFromSetting();
      else await this.synchronize();
    }
    this.onChange();
  }

  async clearPrivateLocal() {
    assert(isGM(game.user), "forbidden");
    const requests = [...this.requests.values()].filter(request => request.visibility !== "gm");
    const usedIds = [...this.usedIds.values()].filter(used => used.visibility !== "gm");
    await this.storage.saveLocal(this.worldId, this.userId, requests, usedIds);
    this.requests = new Map(requests.map(request => [request.id, request]));
    this.usedIds = new Map(usedIds.map(used => [used.id, used]));
    this.privateReady = true;
    this.onChange();
  }
}
