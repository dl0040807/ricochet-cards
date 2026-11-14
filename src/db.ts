// IndexedDB: one record per day. Photos and depth maps stay on the device.
export type Entry = { date: string; mood?: number; memo?: string; photo?: Blob; depth?: Blob; sample?: number; done?: boolean };

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= new Promise((ok, no) => {
  const r = indexedDB.open('vrdiary', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('days', { keyPath: 'date' });
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
}));
const req = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) =>
  new Promise<T>(async (ok, no) => {
    const r = fn((await db()).transaction('days', mode).objectStore('days'));
    r.onsuccess = () => ok(r.result as T);
    r.onerror = () => no(r.error);
  });

export const allEntries = () => req<Entry[]>('readonly', (s) => s.getAll());
export const getEntry = (date: string) => req<Entry | undefined>('readonly', (s) => s.get(date));
export const putEntry = (e: Entry) => req<IDBValidKey>('readwrite', (s) => s.put(e));
export const clearAll = () => req<undefined>('readwrite', (s) => s.clear());
/** Merge fields into a day's record. */
export async function patchEntry(date: string, p: Partial<Entry>) {
  const e = { ...((await getEntry(date)) ?? { date }), ...p };
  await putEntry(e);
  return e;
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
