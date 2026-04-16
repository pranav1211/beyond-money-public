const DB_NAME = 'beyond-money'
const DB_VERSION = 3
const STORES = ['accounts', 'transactions', 'creditCards', 'assets', 'subscriptions', 'categories', 'labels', 'ccExpenses']

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      STORES.forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      })
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function cloneForIDB(items) {
  try {
    return JSON.parse(JSON.stringify(items))
  } catch {
    return []
  }
}

export async function idbGet(storeName) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch {
    return []
  }
}

export async function idbSet(storeName, items) {
  try {
    const clean = cloneForIDB(items)
    if (!clean.length) return
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.clear()
      clean.forEach(item => store.put(item))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silently fail - idb is a cache layer
  }
}

export async function idbClearAll() {
  try {
    const db = await openDB()
    const allStores = [...STORES, 'syncQueue', 'syncMeta']
    const tx = db.transaction(allStores, 'readwrite')
    allStores.forEach(name => tx.objectStore(name).clear())
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silently fail
  }
}

// --- Sync Queue ---

export async function syncQueueAdd(operation) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readwrite')
      const store = tx.objectStore('syncQueue')
      const item = { ...operation, created_at: Date.now(), retries: 0 }
      const req = store.add(item)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function syncQueueGetAll() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readonly')
      const store = tx.objectStore('syncQueue')
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function syncQueueRemove(id) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readwrite')
      const store = tx.objectStore('syncQueue')
      store.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silently fail
  }
}

export async function syncQueueUpdate(id, updates) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readwrite')
      const store = tx.objectStore('syncQueue')
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const item = getReq.result
        if (item) {
          store.put({ ...item, ...updates })
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silently fail
  }
}

export async function syncQueueClear() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readwrite')
      tx.objectStore('syncQueue').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silently fail
  }
}

// --- Sync Metadata (last sync time) ---

export async function syncMetaGet(key) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncMeta', 'readonly')
      const store = tx.objectStore('syncMeta')
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result?.value ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function syncMetaSet(key, value) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncMeta', 'readwrite')
      const store = tx.objectStore('syncMeta')
      store.put({ key, value })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silently fail
  }
}
