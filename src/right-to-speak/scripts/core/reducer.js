import {ACTIVE, assert, CATEGORIES, RequestError, validateNote, validateTarget} from "./request-model.js";
import {canAct} from "./privacy.js";

export function createRequest(draft, {now, order}) {
  return Object.freeze({...draft, status: "pending", createdAt: now, updatedAt: now, order, revision: 1});
}

export function reduceRequest(current, command, context) {
  const {actor, now, userIds} = context;
  assert(current && ACTIVE.has(current.status), "inactiveRequest");
  assert(canAct(actor, current, command.type), "forbidden");
  assert(Number.isSafeInteger(command.expectedRevision) && command.expectedRevision === current.revision, "conflict");
  const next = {...current, revision: current.revision + 1, updatedAt: now};
  switch (command.type) {
    case "UPDATE_REQUEST": {
      const category = command.category;
      assert(CATEGORIES.has(category) && (current.urgency === "urgent" ? category !== "word" : category === "word"), "invalidCategory");
      next.category = category;
      next.targetUserId = validateTarget(command.targetUserId ?? null, current.ownerUserId, userIds);
      next.note = validateNote(command.note ?? "");
      break;
    }
    case "ESCALATE":
      assert(current.urgency === "normal", "invalidTransition");
      next.urgency = "urgent";
      next.category = "intervention";
      break;
    case "ESCALATE_WITH_DETAILS":
      assert(current.urgency === "normal", "invalidTransition");
      assert(CATEGORIES.has(command.category) && !["word", "intervention"].includes(command.category), "invalidCategory");
      next.urgency = "urgent";
      next.category = command.category;
      next.targetUserId = validateTarget(command.targetUserId ?? null, current.ownerUserId, userIds);
      next.note = validateNote(command.note ?? "");
      break;
    case "SET_VISIBILITY":
      assert(["public", "gm"].includes(command.visibility) && command.visibility !== current.visibility, "invalidVisibility");
      next.visibility = command.visibility;
      break;
    case "CANCEL_REQUEST":
      next.status = "cancelled";
      break;
    case "ACKNOWLEDGE_REQUEST":
      assert(current.status === "pending", "invalidTransition");
      next.status = "acknowledged";
      break;
    case "GRANT_FLOOR":
      assert(["pending", "acknowledged"].includes(current.status), "invalidTransition");
      next.status = "floor";
      break;
    case "CLOSE_REQUEST":
      next.status = "closed";
      break;
    default:
      throw new RequestError("invalidOperation");
  }
  return Object.freeze(next);
}
