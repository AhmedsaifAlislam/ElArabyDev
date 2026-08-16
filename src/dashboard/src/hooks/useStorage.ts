import { useCallback, useEffect, useState } from 'preact/hooks';
import { storageGet, storageSet, smartLog } from '../services/storage';
import { messageBus } from '../services/message-bus';

/**
 * Subscribe to storage changes via storage.onChanged
 * Returns a state that updates in real-time when the key changes
 */
export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    let active = true;

    (async () => {
      const result = await storageGet<T>(key);
      if (active && result[key] !== undefined) {
        setValue(result[key]);
      }
    })();

    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== 'local' || !changes[key]) return;
      setValue(changes[key].newValue);
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onChange);
    }

    return () => {
      active = false;
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(onChange);
      }
    };
  }, [key]);

  const set = useCallback(
    async (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        storageSet({ [key]: v }).catch(() => {});
        return v;
      });
    },
    [key]
  );

  return [value, set] as const;
}

/**
 * Reactive read of SmartLog entries
 */
export function useLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const entries = await smartLog.getEntries(500);
    setLogs(entries);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();

    const unsubscribe = messageBus.on('smartlog:update', () => refresh());
    return unsubscribe;
  }, [refresh]);

  return { logs, loading, refresh };
}

/**
 * Reactive read of CRM extractor state
 */
export function useCRMState() {
  const [state, setState] = useState<any>(null);

  const refresh = useCallback(async () => {
    const result = await storageGet<any>('crmExtractorState');
    setState(result.crmExtractorState ?? null);
  }, []);

  useEffect(() => {
    refresh();

    const unsubscribe = messageBus.on('crm:progress', () => refresh());
    const unsubscribe2 = messageBus.on('crm:completed', () => refresh());
    const unsubscribe3 = messageBus.on('crm:started', () => refresh());
    return () => {
      unsubscribe();
      unsubscribe2();
      unsubscribe3();
    };
  }, [refresh]);

  return { state, refresh };
}
