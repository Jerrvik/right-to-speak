const DB_NAME = "right-to-speak-v1";
const STORE = "states";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => blocked ? request.result.close() : resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("IndexedDB blocked")); };
  });
}

async function transaction(mode, key, value) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = mode === "readonly" ? store.get(key) : value === null ? store.delete(key) : store.put(value, key);
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function storageKey(worldId, userId) {
  return `${worldId}:${userId}`;
}

export async function loadLocal(worldId, userId) {
  const value = await transaction("readonly", storageKey(worldId, userId));
  if (!value || value.worldId !== worldId || value.userId !== userId || Date.now() - value.savedAt > MAX_AGE_MS) return {requests: [], usedIds: []};
  return {
    requests: Array.isArray(value.requests) ? value.requests : [],
    usedIds: Array.isArray(value.usedIds) ? value.usedIds : []
  };
}

export async function saveLocal(worldId, userId, requests, usedIds = []) {
  await transaction("readwrite", storageKey(worldId, userId), {worldId, userId, savedAt: Date.now(), requests, usedIds});
}

export async function clearLocal(worldId, userId) {
  await transaction("readwrite", storageKey(worldId, userId), null);
}
