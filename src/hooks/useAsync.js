import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Loads data with loading/error state (Ref 10.7).
 * `load` runs on mount and whenever `deps` change; `reload()` runs it again.
 */
export function useAsync(load, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true, error: null }))
    loadRef.current()
      .then((data) => active && setState({ loading: false, data, error: null }))
      .catch((error) => active && setState({ loading: false, data: null, error }))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback((data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })), [])
  return { ...state, reload, setData }
}

/** Value that only updates after `delay` ms without changes. */
export function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
