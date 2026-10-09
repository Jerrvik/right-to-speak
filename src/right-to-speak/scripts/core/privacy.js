import {ACTIVE, assert} from "./request-model.js";

export function isGM(user) {
  return !!user && user.role === 4; // CONST.USER_ROLES.GAMEMASTER in Foundry V14.
}

export function canReadFull(request, user) {
  return isGM(user) || request.ownerUserId === user?.id;
}

export function publicProjection(request, publicOrder) {
  assert(request.visibility === "public", "privateProjection");
  assert(Number.isSafeInteger(publicOrder) && publicOrder > 0, "invalidOrder");
  return {
    id: request.id,
    ownerUserId: request.ownerUserId,
    urgency: request.urgency,
    category: request.category,
    targetUserId: request.targetUserId,
    status: request.status,
    createdAt: request.createdAt,
    order: publicOrder
  };
}

export function publicQueue(requests) {
  return requests.filter(r => r.visibility === "public" && ACTIVE.has(r.status))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((request, index) => publicProjection(request, index + 1));
}

export function authorizedSnapshot(requests, user) {
  return requests.filter(r => canReadFull(r, user)).map(r => structuredClone(r));
}

export function canAct(actor, request, action) {
  if (["ACKNOWLEDGE_REQUEST", "GRANT_FLOOR", "CLOSE_REQUEST", "CLEAR_QUEUE"].includes(action)) return isGM(actor);
  if (action === "CANCEL_REQUEST" || action === "UPDATE_REQUEST" || action === "ESCALATE" || action === "SET_VISIBILITY") {
    return isGM(actor) || actor?.id === request?.ownerUserId;
  }
  return false;
}
