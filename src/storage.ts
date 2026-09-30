const DB_NAME = 'myauto-db';
const DB_VERSION = 1;

export type PhotoRecord = {
  id: string;
  handoverId: string;
  blob: Blob;
  thumb: Blob;
  addedAt: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('photos')) {
          const store = db.createObjectStore('photos', { keyPath: 'id' });
          store.createIndex('handoverId', 'handoverId');
        }
        if (!db.objectStoreNames.contains('signatures')) {
          db.createObjectStore('signatures', { keyPath: 'handoverId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

const urlCache = new Map<string, string>();

export function invalidatePhoto(id: string) {
  for (const k of ['p:' + id, 't:' + id]) {
    const u = urlCache.get(k);
    if (u) {
      URL.revokeObjectURL(u);
      urlCache.delete(k);
    }
  }
}

async function makeThumb(blob: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const max = 300;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('thumb'))), 'image/jpeg', 0.7);
    });
  } catch {
    return blob;
  }
}

export async function savePhoto(handoverId: string, blob: Blob, id?: string): Promise<string> {
  const photoId = id || crypto.randomUUID();
  invalidatePhoto(photoId);
  const thumb = await makeThumb(blob);
  const rec: PhotoRecord = { id: photoId, handoverId, blob, thumb, addedAt: new Date().toISOString() };
  await tx('photos', 'readwrite', s => s.put(rec));
  return photoId;
}

export function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  return tx('photos', 'readonly', s => s.get(id));
}

export function deletePhoto(id: string): Promise<unknown> {
  invalidatePhoto(id);
  return tx('photos', 'readwrite', s => s.delete(id));
}

export async function getThumbUrl(id: string): Promise<string> {
  if (!id) return '';
  if (id.startsWith('data:')) return id;
  const key = 't:' + id;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const rec = await getPhoto(id);
  if (!rec) return '';
  const url = URL.createObjectURL(rec.thumb);
  urlCache.set(key, url);
  return url;
}

export async function getPhotoUrl(id: string): Promise<string> {
  if (!id) return '';
  if (id.startsWith('data:')) return id;
  const key = 'p:' + id;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const rec = await getPhoto(id);
  if (!rec) return '';
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(key, url);
  return url;
}

export async function saveSignature(handoverId: string, blob: Blob): Promise<void> {
  const key = 's:' + handoverId;
  const hit = urlCache.get(key);
  if (hit) {
    URL.revokeObjectURL(hit);
    urlCache.delete(key);
  }
  await tx('signatures', 'readwrite', s => s.put({ handoverId, blob, addedAt: new Date().toISOString() }));
}

export async function getSignatureUrl(handoverId: string): Promise<string> {
  const key = 's:' + handoverId;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const rec = await tx<{ handoverId: string; blob: Blob } | undefined>('signatures', 'readonly', s =>
    s.get(handoverId)
  );
  if (!rec) return '';
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(key, url);
  return url;
}

export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(r => r.blob());
}

export async function getSignatureBlob(handoverId: string): Promise<Blob | null> {
  const rec = await tx<{ handoverId: string; blob: Blob } | undefined>('signatures', 'readonly', s =>
    s.get(handoverId)
  );
  return rec ? rec.blob : null;
}
