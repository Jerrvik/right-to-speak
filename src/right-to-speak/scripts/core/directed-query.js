import {assert, MODULE_ID, RequestError} from "./request-model.js";

const VERIFY_QUERY = `${MODULE_ID}.verifySender`;
const VERIFY_TIMEOUT = 8000;

function canonical(value) {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  });
}

function randomNonce() {
  assert(typeof globalThis.crypto?.getRandomValues === "function", "forbidden");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export class DirectedQueries {
  constructor({version = () => game.version, user = () => game.user,
    users = () => game.users, register = (name, handler) => { CONFIG.queries[name] = handler; }} = {}) {
    this.version = version;
    this.user = user;
    this.users = users;
    this.registerHandler = register;
    this.pending = new Map();
  }

  generation() {
    const major = Number.parseInt(String(this.version()), 10);
    assert(major === 13 || major === 14, "forbidden");
    return major;
  }

  registerVerifier() {
    this.registerHandler(VERIFY_QUERY, data => {
      const pending = this.pending.get(data?.nonce);
      if (!pending || pending.targetUserId !== data.targetUserId
        || pending.name !== data.name || pending.payload !== canonical(data.payload)) return {valid: false};
      this.pending.delete(data.nonce); // A proof authorizes exactly one delivery.
      return {valid: true};
    });
  }

  register(name, handler) {
    assert(name.startsWith(`${MODULE_ID}.`) && name !== VERIFY_QUERY, "forbidden");
    this.registerHandler(name, async (packet, context) => {
      if (this.generation() === 14) {
        assert(context?.user, "forbidden");
        return handler(packet, context);
      }
      const proof = packet?.auth;
      assert(proof && typeof proof.senderUserId === "string"
        && typeof proof.nonce === "string" && /^[a-f0-9]{48}$/.test(proof.nonce)
        && packet.payload && typeof packet.payload === "object", "forbidden");
      const sender = this.users().get(proof.senderUserId);
      assert(sender?.active && sender.id !== this.user().id, "forbidden");
      // V13 does not pass a trusted sender to query handlers. Confirm that the
      // claimed sender has this exact operation pending for this recipient.
      const confirmation = await sender.query(VERIFY_QUERY, {
        nonce: proof.nonce, targetUserId: this.user().id, name, payload: packet.payload
      }, {timeout: VERIFY_TIMEOUT});
      assert(confirmation?.valid === true, "forbidden");
      return handler(packet.payload, {user: sender});
    });
  }

  async query(target, name, payload, options = {}) {
    if (this.generation() === 14) return target.query(name, payload, options);
    assert(target?.id && target.id !== this.user().id, "forbidden");
    const nonce = randomNonce();
    this.pending.set(nonce, {targetUserId: target.id, name, payload: canonical(payload)});
    try {
      return await target.query(name, {
        auth: {senderUserId: this.user().id, nonce}, payload
      }, {...options, timeout: Math.max(2 * VERIFY_TIMEOUT, options.timeout ?? 0)});
    } finally {
      this.pending.delete(nonce);
    }
  }
}

export const directedQueries = new DirectedQueries();
