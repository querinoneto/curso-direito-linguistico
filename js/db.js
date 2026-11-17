// Armazenamento local (IndexedDB): o livro, o histórico de versões e as pilhas de desfazer.
const DB = (() => {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('curso-direito-linguistico', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function get(key) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  }
  async function set(key, val) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
  async function del(key) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
  return { get, set, del };
})();
