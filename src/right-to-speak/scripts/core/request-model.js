export const MODULE_ID = "right-to-speak";
export const ACTIVE = new Set(["pending", "acknowledged"]);
export const CATEGORIES = new Set(["word", "intervention", "action", "support", "counteraction", "clarification"]);
export const URGENCIES = new Set(["normal", "urgent"]);
export const VISIBILITIES = new Set(["public", "gm"]);
export const STATUS = new Set([...ACTIVE, "floor", "closed", "cancelled"]);

export class RequestError extends Error {
  constructor(code) {
    super(code);
    this.name = "RequestError";
    this.code = code;
  }
}

export function assert(condition, code) {
  if (!condition) throw new RequestError(code);
}

export function validateId(id) {
  assert(typeof id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(id), "invalidId");
  return id;
}

export function validateNote(note) {
  assert(typeof note === "string" && Array.from(note).length <= 240, "invalidNote");
  return note;
}

export function validateTarget(targetUserId, ownerUserId, userIds) {
  assert(targetUserId === null || (typeof targetUserId === "string" && userIds.includes(targetUserId) && targetUserId !== ownerUserId), "invalidTarget");
  return targetUserId;
}

export function validateDraft(draft, ownerUserId, userIds) {
  assert(draft && typeof draft === "object" && !Array.isArray(draft), "invalidRequest");
  validateId(draft.id);
  assert(URGENCIES.has(draft.urgency), "invalidUrgency");
  assert(CATEGORIES.has(draft.category), "invalidCategory");
  assert(VISIBILITIES.has(draft.visibility), "invalidVisibility");
  assert((draft.urgency === "normal") === (draft.category === "word"), "invalidCategory");
  validateNote(draft.note ?? "");
  validateTarget(draft.targetUserId ?? null, ownerUserId, userIds);
  return {
    id: draft.id,
    ownerUserId,
    urgency: draft.urgency,
    category: draft.category,
    targetUserId: draft.targetUserId ?? null,
    note: draft.note ?? "",
    visibility: draft.visibility
  };
}

export function validateStoredRequest(request, worldUserIds) {
  assert(request && typeof request === "object", "invalidRequest");
  validateId(request.id);
  assert(typeof request.ownerUserId === "string" && worldUserIds.includes(request.ownerUserId), "invalidOwner");
  assert(URGENCIES.has(request.urgency) && CATEGORIES.has(request.category), "invalidCategory");
  assert(VISIBILITIES.has(request.visibility) && STATUS.has(request.status), "invalidRequest");
  validateNote(request.note);
  if (request.notePublic !== undefined) assert(typeof request.notePublic === "boolean", "invalidRequest");
  if (request.answer !== undefined) validateNote(request.answer);
  if (request.answerPublic !== undefined) assert(typeof request.answerPublic === "boolean", "invalidRequest");
  assert(request.targetUserId === null || typeof request.targetUserId === "string", "invalidTarget");
  assert(Number.isSafeInteger(request.order) && request.order > 0, "invalidOrder");
  assert(Number.isSafeInteger(request.revision) && request.revision > 0, "invalidRevision");
  assert(!Number.isNaN(Date.parse(request.createdAt)) && !Number.isNaN(Date.parse(request.updatedAt)), "invalidTime");
  return request;
}

export function sortQueue(requests) {
  return [...requests].filter(r => ACTIVE.has(r.status)).sort((a, b) => {
    const priority = Number(b.urgency === "urgent") - Number(a.urgency === "urgent");
    return priority || a.order - b.order || a.id.localeCompare(b.id);
  });
}
