import { useEffect, useRef, useState, useCallback } from 'react';
import { AutoSaveStatus } from '../types';

interface UseAutoSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void> | void;
  debounceMs?: number;
  enabled?: boolean;
}

export function useAutoSave<T>({
  data,
  onSave,
  debounceMs = 500,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const initialMount = useRef(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const latestDataRef = useRef<T>(data);
  const lastSavedDataJsonRef = useRef<string>(JSON.stringify(data));
  const onSaveRef = useRef(onSave);

  onSaveRef.current = onSave;
  latestDataRef.current = data;

  const performSave = useCallback(async (dataToSave: T) => {
    try {
      setStatus('saving');
      setError(null);
      await onSaveRef.current(dataToSave);
      lastSavedDataJsonRef.current = JSON.stringify(dataToSave);
      setStatus('saved');
      setLastSavedAt(Date.now());
    } catch (err: any) {
      console.error('AutoSave failed:', err);
      setStatus('error');
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const forceSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await performSave(latestDataRef.current);
  }, [performSave]);

  useEffect(() => {
    // Avoid triggering auto-save on initial component mount
    if (initialMount.current) {
      initialMount.current = false;
      lastSavedDataJsonRef.current = JSON.stringify(data);
      return;
    }

    if (!enabled) return;

    const currentJson = JSON.stringify(data);
    if (currentJson === lastSavedDataJsonRef.current) {
      return; // No substantive changes
    }

    setStatus('saving');

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      performSave(data);
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [data, debounceMs, enabled, performSave]);

  return {
    status,
    lastSavedAt,
    error,
    forceSave,
  };
}
