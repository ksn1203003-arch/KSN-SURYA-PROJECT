import { useState, useCallback, useRef } from "react"

interface AsyncState<T> {
  data:    T | null
  error:   string | null
  loading: boolean
}

interface UseAsyncReturn<T> extends AsyncState<T> {
  execute: (...args: Parameters<() => Promise<T>>) => Promise<void>
  reset:   () => void
}

export function useAsync<T>(fn: () => Promise<T>): UseAsyncReturn<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: false })
  const fnRef = useRef(fn)
  fnRef.current = fn

  const execute = useCallback(async () => {
    setState({ data: null, error: null, loading: true })
    try {
      const result = await fnRef.current()
      setState({ data: result, error: null, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setState({ data: null, error: message, loading: false })
    }
  }, [])

  const reset = useCallback(() => {
    setState({ data: null, error: null, loading: false })
  }, [])

  return { ...state, execute, reset }
}
