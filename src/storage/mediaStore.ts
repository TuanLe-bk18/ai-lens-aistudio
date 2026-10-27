export interface StoredMediaRecord {
  sourceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  thumbnailDataUrl?: string;
  blob: Blob;
  createdAt: string;
}

const DB_NAME = 'ai_lens_media_db_v3';
const STORE_NAME = 'custom_media';
const DB_VERSION = 1;

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sourceId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomMediaToIndexedDb(record: StoredMediaRecord): Promise<boolean> {
  try {
    const db = await openMediaDb();
    if (!db) return false;
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return false;
  }
}

export async function loadCustomMediaFromIndexedDb(
  sourceId: string
): Promise<StoredMediaRecord | null> {
  try {
    const db = await openMediaDb();
    if (!db) return null;
    return await new Promise<StoredMediaRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(sourceId);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as StoredMediaRecord) || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

export async function clearAllCustomMediaFromIndexedDb(): Promise<void> {
  try {
    const db = await openMediaDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function inspectVideoFileMetadata(
  file: File
): Promise<{ durationSeconds: number; thumbnailDataUrl?: string }> {
  if (typeof document === 'undefined') {
    return { durationSeconds: 30 };
  }
  if (file.type.startsWith('image/')) {
    const dataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === 'string' ? r.result : '');
      r.readAsDataURL(file);
    });
    return { durationSeconds: 10, thumbnailDataUrl: dataUrl };
  }

  return new Promise((resolve) => {
    const tempUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (durationSeconds: number, thumbnailDataUrl?: string) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(tempUrl);
      resolve({
        durationSeconds: Math.max(1, Number(durationSeconds.toFixed(1)) || 30),
        thumbnailDataUrl,
      });
    };

    const timer = setTimeout(() => finish(30), 4000);

    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 30;
      video.currentTime = Math.min(1, dur / 2);
    };

    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.75);
          finish(video.duration, thumb);
          return;
        }
      } catch {
        // ignore canvas error
      }
      finish(video.duration);
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish(30);
    };

    video.src = tempUrl;
  });
}
