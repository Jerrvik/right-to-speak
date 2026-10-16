import {assert, MODULE_ID, RequestError, validateId} from "./request-model.js";
import {isGM} from "./privacy.js";
import {loadLocal, saveMessages} from "./storage.js";
import {directedQueries} from "./directed-query.js";

const QUERY = {
  send: `${MODULE_ID}.personal.send`,
  receipt: `${MODULE_ID}.personal.receipt`,
  status: `${MODULE_ID}.personal.status`
};
const TIMEOUT = 8000;
const HISTORY_LIMIT = 30;

export function validatePersonalDraft(draft, senderUserId, users) {
  assert(draft && typeof draft === "object" && !Array.isArray(draft), "invalidMessage");
  validateId(draft.id);
  assert(typeof draft.targetUserId === "string" && draft.targetUserId !== senderUserId, "invalidTarget");
  const target = users.get(draft.targetUserId);
  assert(target && !isGM(target), "invalidTarget");
  assert(typeof draft.text === "string" && Array.from(draft.text.trim()).length > 0 && Array.from(draft.text).length <= 240, "invalidMessage");
  const rootId = draft.rootId ?? draft.id;
  validateId(rootId);
  return {id: draft.id, rootId, kind: "personal", senderUserId, targetUserId: draft.targetUserId, text: draft.text.trim()};
}

function validStored(message, userId) {
  return message && typeof message === "object" && typeof message.id === "string"
    && (message.senderUserId === userId || message.targetUserId === userId)
    && typeof message.senderUserId === "string" && typeof message.targetUserId === "string"
    && typeof message.text === "string" && Array.from(message.text).length <= 240
    && ["sending", "sent", "read", "unread"].includes(message.status)
    && !Number.isNaN(Date.parse(message.createdAt))
    && (!message.kind || ["personal", "request"].includes(message.kind))
    && (!message.rootId || typeof message.rootId === "string");
}

function recent(messages) {
  const all = [...messages];
  const newest = all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, HISTORY_LIMIT);
  const roots = new Set(newest.map(message => message.rootId));
  const kept = new Map(newest.map(message => [message.id, message]));
  for (const message of all) if (message.id === message.rootId && roots.has(message.id)) kept.set(message.id, message);
  return [...kept.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export class PersonalTransport {
  constructor(onChange, storage = {loadLocal, saveMessages}, requestTransport = null) {
    this.onChange = onChange;
    this.storage = storage;
    this.requestTransport = requestTransport;
    this.messages = new Map();
    this.worldId = null;
    this.userId = null;
    this.ready = false;
  }

  static registerQueries(instance) {
    directedQueries.register(QUERY.send, (data, context) => instance.receive(data, context));
    directedQueries.register(QUERY.receipt, (data, context) => instance.receiveReceipt(data, context));
    directedQueries.register(QUERY.status, (data, context) => instance.receiveStatus(data, context));
  }

  async start() {
    this.worldId = game.world.id;
    this.userId = game.user.id;
    try {
      const local = await this.storage.loadLocal(this.worldId, this.userId);
      for (const message of local.messages ?? []) if (validStored(message, this.userId)) {
        this.messages.set(message.id, {...message, kind: message.kind ?? "personal", rootId: message.rootId ?? message.id});
      }
      this.ready = true;
    } catch { this.ready = false; }
    this.onChange();
    void this.synchronize();
  }

  history() { return recent(this.messages.values()); }
  thread(kind, rootId) { return [...this.messages.values()].filter(message => message.kind === kind && message.rootId === rootId).sort((a, b) => (a.id === rootId ? -1 : 0) - (b.id === rootId ? -1 : 0) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)); }
  requestUnreadCount() { return this.history().filter(message => message.kind === "request" && message.targetUserId === this.userId && message.status === "unread").length; }
  unreadCount() { return this.history().filter(message => message.targetUserId === this.userId && message.status === "unread").length; }
  incoming(id) {
    const message = this.messages.get(id);
    return message?.targetUserId === this.userId ? message : null;
  }

  async persist(message) {
    assert(this.ready, "personalStorageUnavailable");
    const old = this.messages;
    this.messages = new Map(recent([...this.messages.values()].filter(entry => entry.id !== message.id).concat(message)).map(entry => [entry.id, entry]));
    try { await this.storage.saveMessages(this.worldId, this.userId, [...this.messages.values()]); }
    catch { this.messages = old; this.ready = false; throw new RequestError("personalStorageUnavailable"); }
    this.onChange();
  }

  requestFor(rootId) {
    const transport = this.requestTransport;
    return isGM(game.user) ? transport?.requests?.get(rootId) : transport?.own?.get(rootId);
  }

  validateDraft(draft, senderUserId) {
    if (draft?.kind !== "request") {
      const parsed = validatePersonalDraft(draft, senderUserId, game.users);
      if (parsed.rootId !== parsed.id) {
        const root = this.messages.get(parsed.rootId);
        assert(root?.kind === "personal" && root.rootId === root.id
          && [root.senderUserId, root.targetUserId].includes(senderUserId)
          && [root.senderUserId, root.targetUserId].includes(parsed.targetUserId), "forbidden");
      }
      return parsed;
    }
    validateId(draft.id); validateId(draft.rootId);
    assert(typeof draft.text === "string" && Array.from(draft.text.trim()).length > 0 && Array.from(draft.text).length <= 240, "invalidMessage");
    const request = this.requestFor(draft.rootId);
    assert(request && request.ownerUserId, "notFound");
    const targetUserId = isGM(game.user) ? request.ownerUserId : draft.targetUserId;
    assert(typeof targetUserId === "string" && game.users.get(targetUserId), "invalidTarget");
    if (isGM(game.user)) assert(senderUserId === this.userId && draft.targetUserId === request.ownerUserId, "forbidden");
    else assert(request.ownerUserId === this.userId && isGM(game.users.get(targetUserId)) && senderUserId === this.userId, "forbidden");
    return {id: draft.id, rootId: draft.rootId, kind: "request", senderUserId, targetUserId, text: draft.text.trim()};
  }

  validateIncoming(data, senderUserId) {
    if (data?.kind !== "request") return this.validateDraft(data, senderUserId);
    validateId(data.id); validateId(data.rootId);
    assert(typeof data.text === "string" && Array.from(data.text.trim()).length > 0 && Array.from(data.text).length <= 240, "invalidMessage");
    const request = this.requestFor(data.rootId);
    assert(request && request.ownerUserId, "notFound");
    assert(data.targetUserId === this.userId, "forbidden");
    if (isGM(game.user)) assert(senderUserId === request.ownerUserId, "forbidden");
    else assert(request.ownerUserId === this.userId && isGM(game.users.get(senderUserId)), "forbidden");
    return {id: data.id, rootId: data.rootId, kind: "request", senderUserId, targetUserId: this.userId, text: data.text.trim()};
  }

  async send(draft) {
    assert(!isGM(game.user) || draft?.kind === "request", "forbidden");
    assert(game.user.hasPermission("QUERY_USER"), "queryDenied");
    const parsed = this.validateDraft(draft, this.userId);
    const target = game.users.get(parsed.targetUserId);
    assert(target.active, "recipientOffline");
    let message = this.messages.get(parsed.id);
    if (message) {
      assert(message.senderUserId === this.userId && message.targetUserId === parsed.targetUserId && message.text === parsed.text && message.rootId === parsed.rootId && message.kind === parsed.kind, "forbidden");
      if (message.status === "read") return message;
    } else {
      // In Foundry 14, game.time.serverTime is world-server uptime, not an epoch timestamp.
      const previous = this.thread(parsed.kind, parsed.rootId).at(-1);
      const time = Math.max(Date.now(), previous ? Date.parse(previous.createdAt) + 1 : 0);
      message = {...parsed, createdAt: new Date(time).toISOString(), status: "sending"};
      await this.persist(message);
    }
    const result = await directedQueries.query(target, QUERY.send, {id: message.id, rootId: message.rootId, kind: message.kind, targetUserId: message.targetUserId, text: message.text, createdAt: message.createdAt}, {timeout: TIMEOUT});
    const updated = {...message, status: result?.status === "read" ? "read" : "sent"};
    await this.persist(updated);
    return updated;
  }

  async receive(data, context) {
    assert(context?.user, "forbidden");
    assert(data?.kind === "request" || (!isGM(game.user) && !isGM(context.user)), "forbidden");
    const parsed = this.validateIncoming(data, context.user.id);
    assert(parsed.targetUserId === this.userId, "forbidden");
    assert(!Number.isNaN(Date.parse(data.createdAt)), "invalidMessage");
    const existing = this.messages.get(parsed.id);
    if (existing) {
      assert(existing.senderUserId === context.user.id && existing.targetUserId === this.userId && existing.text === parsed.text && existing.rootId === parsed.rootId && existing.kind === parsed.kind, "forbidden");
      return {status: existing.status};
    }
    const message = {...parsed, createdAt: data.createdAt, status: "unread"};
    await this.persist(message);
    this.onChange({personalIncoming: message});
    return {status: "unread"};
  }

  async markRead(id) {
    const message = this.incoming(id);
    assert(message, "notFound");
    if (message.status !== "read") await this.persist({...message, status: "read"});
    const sender = game.users.get(message.senderUserId);
    if (sender?.active) {
      try { await directedQueries.query(sender, QUERY.receipt, {id}, {timeout: TIMEOUT}); }
      catch { /* Sender can recover the receipt through a later directed status query. */ }
    }
  }

  async receiveReceipt(data, context) {
    assert(context?.user && typeof data?.id === "string", "forbidden");
    const message = this.messages.get(data.id);
    assert(message?.senderUserId === this.userId && message.targetUserId === context.user.id, "forbidden");
    if (message.status !== "read") await this.persist({...message, status: "read"});
    return {ok: true};
  }

  receiveStatus(data, context) {
    assert(context?.user && Array.isArray(data?.ids) && data.ids.length <= HISTORY_LIMIT, "forbidden");
    return {readIds: data.ids.filter(id => {
      const message = this.messages.get(id);
      return message?.targetUserId === this.userId && message.senderUserId === context.user.id && message.status === "read";
    })};
  }

  async synchronize() {
    if (!this.ready || !game.user.hasPermission("QUERY_USER")) return;
    const pending = this.history().filter(message => message.senderUserId === this.userId && message.status !== "read");
    const targets = new Set(pending.map(message => message.targetUserId));
    for (const id of targets) {
      const target = game.users.get(id);
      if (!target?.active) continue;
      const ids = pending.filter(message => message.targetUserId === id).map(message => message.id);
      try {
        const result = await directedQueries.query(target, QUERY.status, {ids}, {timeout: TIMEOUT});
        for (const readId of result?.readIds ?? []) {
          const message = this.messages.get(readId);
          if (message?.senderUserId === this.userId && message.targetUserId === id && message.status !== "read") {
            await this.persist({...message, status: "read"});
          }
        }
      } catch { /* The recipient may reconnect later. */ }
    }
  }
}
