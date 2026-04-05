import type {RiskAssessment} from "@/offscreen/RiskAssessment";
/* The hasher xxhash64 is fast, hashing the image in 1ms or less.
 * It's less than resizing/center crop the image and insignificant compared to the fastest ML model.
 * So using the cache is without performance cost in execution time.
 */
import type {AnalyseImageInfo} from "@/offscreen/analyseTypes";
import {xxhash64} from "hash-wasm";

interface CacheDecision {
  risk: RiskAssessment,
  isTm: boolean
}

/**
 * Cache ML model decisions using image data (not the src).
 *
 * Image data is hashed. The hash is used as a key. The cache keeps a limit in size. Only the most recent image keys are kept.
 * An already seen image becomes the most recent image when seen again.
 * The src cannot be used because the image behind it could have changed.
 */
export class DecisionCache {
  public doesPersist = true;

  /**
   * The local storage takes less than 600KB for 20000 entries.
   * Indexeddb can save this amount of data and 20000 images is certainly enough.
   */
  private static maxSize = 20000;

  private cache = new Map<string, CacheDecision>();
  private isReady = false;
  private db: IDBDatabase | null = null;

  async init() {
    if (!this.doesPersist) {
      this.isReady = true;
      return;
    }

    const tx = (await this.getDB()).transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const cursorReq = store.openCursor();
    await new Promise<void>((resolve, reject) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const key = cursor.key as string;
          const value = cursor.value as {risk: RiskAssessment; isTm: boolean};

          this.cache.set(key, value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });

    console.info('Restored decision cache with', this.cache.size, 'keys.');

    this.isReady = true;
  }

  async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = await this.openDB();
    }
    return this.db;
  }

  openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('decisionCache', 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('entries')) {
          db.createObjectStore('entries');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async computeKey(imageInfo: AnalyseImageInfo): Promise<string | null> {
    if (!this.isReady) {
      return null;
    }
    return await xxhash64(imageInfo.data);
  }

  getDecision(key: string): CacheDecision | null {
    const decision = this.cache.get(key);
    if (!decision) {
      return null;
    }
    // The map has insertion order. The decision is reinserted so as to put this key decision in last position.
    this.cache.delete(key);
    this.cache.set(key, decision);
    return decision;
  }

  async set(key: string | null, decision: CacheDecision): Promise<void> {
    if (!key) {
      return;
    }
    if (!this.isReady) {
      return;
    }
    this.cache.set(key, decision);
    const removedKeys: string[] = [];
    while (this.cache.size > DecisionCache.maxSize) {
      const removedKey = this.cache.keys().next().value!;
      this.cache.delete(removedKey);
      removedKeys.push(removedKey);
    }

    if (!this.doesPersist) {
      return;
    }

    const tx = (await this.getDB()).transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');

    store.put(decision, key);
    for (const removedKey of removedKeys) {
      store.delete(removedKey);
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear() {
    this.cache.clear();
    await this.clearPersistence();
  }

  async clearPersistence() {
    const tx = (await this.getDB()).transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');

    store.clear();

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
    });
  }
}
