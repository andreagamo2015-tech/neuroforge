import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Card, ExternalAssessment, Experiment, JournalEntry, LessonRecord, SessionRecord, Settings, TaskState, TrialRecord, BlockRecord } from '../core/records';
import { resolveParams, type AdaptiveParams } from '../core/engine/params';
import { initialTaskState } from '../core/engine/adaptive';
import { TASKS } from '../core/registry';
import { deleteRecord, importJSON, loadAll, putRecords, wipeAll, type ExportFile, type StoreName } from './db';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  createdAt: Date.now(),
  onboardingDone: false,
  sessionMinutes: 20,
  goals: { A: 1, B: 1, C: 1, D: 1, E: 1 },
  askConfidence: true,
  sound: false,
  reducedMotion: 'sistema',
  focusMode: true,
  devMode: false,
  restDays: [0, 3],
  params: {},
};

const EMPTY: AppData = { settings: null, sessions: [], blocks: [], trials: [], taskStates: [], journal: [], external: [], cards: [], lessons: [], experiments: [] };

type Collection = 'sessions' | 'blocks' | 'trials' | 'taskStates' | 'journal' | 'external' | 'cards' | 'lessons' | 'experiments';
type RecordOf<C extends Collection> = AppData[C][number];
const KEY_OF: Record<Collection, string> = { sessions: 'id', blocks: 'id', trials: 'id', taskStates: 'taskId', journal: 'id', external: 'id', cards: 'id', lessons: 'id', experiments: 'id' };

interface Store {
  ready: boolean;
  error: string | null;
  data: AppData;
  settings: Settings;
  params: AdaptiveParams;
  states: Record<string, TaskState>;
  saveSettings(patch: Partial<Settings>): Promise<void>;
  upsert<C extends Collection>(c: C, records: RecordOf<C>[]): Promise<void>;
  remove(c: Collection, id: string): Promise<void>;
  wipe(): Promise<void>;
  importData(f: ExportFile): Promise<void>;
  reload(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const reload = useCallback(async () => {
    try {
      setData(await loadAll());
      setReady(true);
    } catch (e) {
      setError(`No se pudo abrir el almacenamiento local (IndexedDB). Puede estar desactivado en modo privado. Detalle: ${String(e)}`);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const settings = data.settings ?? DEFAULT_SETTINGS;
  const params = useMemo(() => resolveParams(settings.params), [settings.params]);
  const states = useMemo(() => {
    const m: Record<string, TaskState> = {};
    for (const t of TASKS) m[t.id] = initialTaskState(t);
    for (const s of data.taskStates) m[s.taskId] = s;
    return m;
  }, [data.taskStates]);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const next: Settings = { ...(dataRef.current.settings ?? { ...DEFAULT_SETTINGS, createdAt: Date.now() }), ...patch, id: 'settings' };
    dataRef.current = { ...dataRef.current, settings: next };
    setData((d) => ({ ...d, settings: next }));
    await putRecords('settings', [next]);
  }, []);

  const upsert = useCallback(async <C extends Collection>(c: C, records: RecordOf<C>[]) => {
    if (!records.length) return;
    const key = KEY_OF[c];
    setData((d) => {
      const list = d[c] as unknown as Record<string, unknown>[];
      const map = new Map(list.map((r) => [r[key] as string, r]));
      for (const r of records as unknown as Record<string, unknown>[]) map.set(r[key] as string, r);
      return { ...d, [c]: [...map.values()] };
    });
    try {
      await putRecords(c as StoreName, records);
    } catch (e) {
      setError(`Error al guardar datos: ${String(e)}`);
    }
  }, []);

  const remove = useCallback(async (c: Collection, id: string) => {
    const key = KEY_OF[c];
    setData((d) => ({ ...d, [c]: (d[c] as unknown as Record<string, unknown>[]).filter((r) => r[key] !== id) }));
    await deleteRecord(c as StoreName, id);
  }, []);

  const wipe = useCallback(async () => {
    await wipeAll();
    setData(EMPTY);
  }, []);

  const importData = useCallback(async (f: ExportFile) => {
    await importJSON(f);
    await reload();
  }, [reload]);

  const value: Store = { ready, error, data, settings, params, states, saveSettings, upsert, remove, wipe, importData, reload };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de AppProvider');
  return s;
}

export type { SessionRecord, TrialRecord, BlockRecord, JournalEntry, ExternalAssessment, Card, LessonRecord, Experiment };
