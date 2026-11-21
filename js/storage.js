// localStorage（進行・名前・設定・完成図）と IndexedDB（録音した声）
const PREFIX = "santaMission.";

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn("save failed", key, e);
  }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* noop */ }
}

// ---------- IndexedDB ----------
const DB_NAME = "santa-mission-db";
const STORE = "voice";
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

export async function getVoiceBlob() {
  try { return (await tx("readonly", s => s.get("santa"))) || null; }
  catch (e) { return null; }
}

export async function saveVoiceBlob(blob) {
  await tx("readwrite", s => s.put(blob, "santa"));
  try { await navigator.storage?.persist?.(); } catch (e) { /* noop */ }
}

export async function deleteVoiceBlob() {
  await tx("readwrite", s => s.delete("santa"));
}
