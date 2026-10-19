// Rekko · Guardado local en IndexedDB. Las demos viven en este navegador.
const DB = 'rekko', STORE = 'demos';
function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt'); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || new Error('Could not open storage.'));
  });
}
function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), s = t.objectStore(STORE); let out;
    try { out = fn(s); } catch (e) { reject(e); }
    t.oncomplete = () => { db.close(); resolve(out?.result ?? out); };
    t.onerror = () => { db.close(); reject(t.error || new Error('Error al guardar.')); };
    t.onabort = () => { db.close(); reject(t.error || new Error('Guardado cancelado.')); };
  }));
}
export const saveDemo = demo => tx('readwrite', s => { s.put(demo); return demo; });
export const loadDemo = id => tx('readonly', s => s.get(id));
export const deleteDemo = id => tx('readwrite', s => { s.delete(id); return id; });
export const listDemos = () => tx('readonly', s => s.getAll()).then(list => (list || []).sort((a, b) => b.updatedAt - a.updatedAt));
export async function storageEstimate() { try { const e = await navigator.storage?.estimate(); return e ? { used: e.usage || 0, quota: e.quota || 0 } : null; } catch { return null; } }
