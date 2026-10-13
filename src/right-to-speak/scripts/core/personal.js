import {assert, MODULE_ID, RequestError, validateId} from "./request-model.js";
import {isGM} from "./privacy.js";
import {loadLocal, saveMessages} from "./storage.js";

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
  return {id: draft.id, senderUserId, targetUserId: draft.targetUserId, text: draft.text.trim()};
}

function validStored(message, userId) {
  return message && typeof message === "object" && typeof message.id === "string"
    && (message.senderUserId === userId || message.targetUserId === userId)
    && typeof message.senderUserId === "string" && typeof message.targetUserId === "string"
    && typeof message.text === "string" && Array.from(message.text).length <= 240
    && ["sending", "sent", "read", "unread"].includes(message.status)
    && !Number.isNaN(Date.parse(message.createdAt));
}

function recent(messages) {
  return [...messages].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, HISTORY_LIMIT);
}

export class PersonalTransport {
  constructor(onChange, storage = {loadLocal, saveMessages}) {
    this.onChange = onChange;
    this.storage = storage;
    this.messages = new Map();
    this.worldId = null;
    this.userId = null;
    this.ready = false;
  }

  static registerQueries(instance) {
    CONFIG.queries[QUERY.send] = (data, context) => instance.receive(data, context);
    CONFIG.queries[QUERY.receipt] = (data, context) => instance.receiveReceipt(data, context);
    CONFIG.queries[QUERY.status] = (data, context) => instance.receiveStatus(data, context);
  }

  async start() {
    this.worldId = game.world.id;
    this.userId = game.user.id;
    try {
      const local = await this.storage.loadLocal(this.worldId, this.userId);
      for (const message of local.messages ?? []) if (validStored(message, this.userId)) this.messages.set(message.id, message);
      this.ready = true;
    } catch { this.ready = false; }
    this.onChange();
    void this.synchronize();
  }

  history() { return recent(this.messages.values()); }
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

  async send(draft) {
    assert(!isGM(game.user), "forbidden");
    assert(game.user.hasPermission("QUERY_USER"), "queryDenied");
    const parsed = validatePersonalDraft(draft, this.userId, game.users);
    const target = game.users.get(parsed.targetUserId);
    assert(target.active, "recipientOffline");
    let message = this.messages.get(parsed.id);
    if (message) {
      assert(message.senderUserId === this.userId && message.targetUserId === parsed.targetUserId && message.text === parsed.text, "forbidden");
      if (message.status === "read") return message;
    } else {
      // In Foundry 14, game.time.serverTime is world-server uptime, not an epoch timestamp.
      message = {...parsed, createdAt: new Date().toISOString(), status: "sending"};
      await this.persist(message);
    }
    const result = await target.query(QUERY.send, {id: message.id, targetUserId: message.targetUserId, text: message.text, createdAt: message.createdAt}, {timeout: TIMEOUT});
    const updated = {...message, status: result?.status === "read" ? "read" : "sent"};
    await this.persist(updated);
    return updated;
  }

  async receive(data, context) {
    assert(!isGM(game.user) && context?.user && !isGM(context.user), "forbidden");
    const parsed = validatePersonalDraft(data, context.user.id, game.users);
    assert(parsed.targetUserId === this.userId, "forbidden");
    assert(!Number.isNaN(Date.parse(data.createdAt)), "invalidMessage");
    const existing = this.messages.get(parsed.id);
    if (existing) {
      assert(existing.senderUserId === context.user.id && existing.targetUserId === this.userId && existing.text === parsed.text, "forbidden");
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
      try { await sender.query(QUERY.receipt, {id}, {timeout: TIMEOUT}); }
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
        const result = await target.query(QUERY.status, {ids}, {timeout: TIMEOUT});
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
