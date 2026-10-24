import { openDB, type IDBPDatabase } from 'idb';
import type { AppData, Settings } from '../core/records';

// Persistencia local en IndexedDB. Ningún dato sale del navegador.

export const DB_NAME = 'neuroforge-x';
export const DB_VERSION = 1;
export const STORES = ['settings', 'sessions', 'blocks', 'trials', 'taskStates', 'journal', 'external', 'cards', 'lessons', 'experiments'] as const;
export type StoreName = (typeof STORES)[number];

const KEY: Record<StoreName, string> = {
  settings: 'id', sessions: 'id', blocks: 'id', trials: 'id', taskStates: 'taskId', journal: 'id', external: 'id', cards: 'id', lessons: 'id', experiments: 'id',
};

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            const os = db.createObjectStore(s, { keyPath: KEY[s] });
            if (s === 'trials' || s === 'blocks') {
              os.createIndex('sessionId', 'sessionId');
              os.createIndex('taskId', 'taskId');
            }
          }
        }
      },
    });
  }
  return dbPromise;
}

/** Solo para pruebas: cierra y olvida la conexión. */
export async function resetConnection() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

export async function loadAll(): Promise<AppData> {
  const db = await getDB();
  const [settings, sessions, blocks, trials, taskStates, journal, external, cards, lessons, experiments] = await Promise.all([
    db.get('settings', 'settings'),
    db.getAll('sessions'),
    db.getAll('blocks'),
    db.getAll('trials'),
    db.getAll('taskStates'),
    db.getAll('journal'),
    db.getAll('external'),
    db.getAll('cards'),
    db.getAll('lessons'),
    db.getAll('experiments'),
  ]);
  return { settings: (settings as Settings) ?? null, sessions, blocks, trials, taskStates, journal, external, cards, lessons, experiments };
}

export async function putRecords(store: StoreName, records: unknown[]): Promise<void> {
  if (!records.length) return;
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
}

export async function deleteRecord(store: StoreName, id: string): Promise<void> {
  const db = await getDB();
  await db.delete(store, id);
}

/** Elimina TODOS los datos de la aplicación (irreversible). */
export async function wipeAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([...STORES], 'readwrite');
  await Promise.all([...STORES.map((s) => tx.objectStore(s).clear()), tx.done]);
}

export interface ExportFile {
  app: 'NEUROFORGE X';
  format: 1;
  exportedAt: string;
  data: AppData;
}

export async function exportJSON(): Promise<ExportFile> {
  return { app: 'NEUROFORGE X', format: 1, exportedAt: new Date().toISOString(), data: await loadAll() };
}

export function validateImport(obj: unknown): obj is ExportFile {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Partial<ExportFile>;
  if (o.app !== 'NEUROFORGE X' || o.format !== 1 || !o.data) return false;
  return ['sessions', 'blocks', 'trials', 'taskStates', 'journal', 'external', 'cards', 'lessons', 'experiments'].every((k) => Array.isArray((o.data as unknown as Record<string, unknown>)[k]));
}

/** Importa sustituyendo los datos actuales. */
export async function importJSON(file: ExportFile): Promise<void> {
  await wipeAll();
  const d = file.data;
  if (d.settings) await putRecords('settings', [d.settings]);
  for (const s of STORES) {
    if (s === 'settings') continue;
    await putRecords(s, (d as unknown as Record<string, unknown[]>)[s] ?? []);
  }
}

const csvCell = (v: unknown) => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV<T extends object>(rows: T[], columns: (keyof T)[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n');
}
