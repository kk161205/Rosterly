import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * List filters kept in the URL, so a filtered view can be shared or reloaded.
 * `update` merges changes, drops empty values (and any in `clearValues`), and
 * resets paging unless `page` itself is being changed.
 */
export function useUrlFilters({ clearValues = [''] }: { clearValues?: string[] } = {}) {
  const [params, setParams] = useSearchParams()

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || clearValues.includes(value)) next.delete(key)
        else next.set(key, value)
      }
      if (!('page' in changes)) next.delete('page')
      setParams(next, { replace: true })
    },
    // clearValues is a constant per page
    [params, setParams], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])

  return { params, update, reset }
}

/** A search box that writes `?search=` 300 ms after typing stops. */
export function useSearchParamText(
  params: URLSearchParams,
  update: (changes: Record<string, string | null>) => void,
): [string, (text: string) => void] {
  const search = params.get('search') ?? ''
  const [text, setText] = useState(search)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.trim() !== search) update({ search: text.trim() })
    }, 300)
    return () => clearTimeout(timer)
  }, [text, search, update])
  return [text, setText]
}
