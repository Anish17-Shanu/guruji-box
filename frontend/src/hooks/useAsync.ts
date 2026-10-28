import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], enabled = true) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: enabled });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    loaderRef
      .current()
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (active) setState({ data: null, error: errorMessage(error), loading: false });
      });
    return () => {
      active = false;
    };
  }, [...deps, tick, enabled]);

  return {
    ...state,
    reload: () => setTick((value) => value + 1),
    setData: (data: T) => setState({ data, error: null, loading: false }),
  };
}
