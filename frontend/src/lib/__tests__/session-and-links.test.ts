import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNotificationDeepLink } from '@/features/notifications/lib/notificationDeepLink'
import { pageFrom } from '@/lib/useUrlFilters'
import { daysUntil, localISODate } from '@/lib/format'

describe('Notification links go where the reader can act', () => {
  it.each([
    ['request', 'r1', 'approval_needed', '/home'],
    ['request', 'r1', 'request_status_change', '/requests?id=r1'],
    ['user', 'u1', 'account_updated', '/profile'],
    ['checklist', 'c1', 'offboarding_assigned', '/offboarding'],
    ['checklist', 'c1', 'onboarding_assigned', '/onboarding'],
    ['asset', 'a1', 'warranty_expiring', '/assets/a1'],
  ])('%s / %s → %s', (entity, id, type, url) => {
    expect(getNotificationDeepLink(entity, id, type)).toBe(url)
  })
})

describe('Page numbers from the address', () => {
  it.each([
    [null, 1],
    ['3', 3],
    ['abc', 1],
    ['0', 1],
    ['-2', 1],
    ['2.7', 2],
  ])('?page=%s → %s', (raw, page) => {
    const params = new URLSearchParams(raw === null ? '' : `page=${raw}`)
    expect(pageFrom(params)).toBe(page)
  })
})

describe('Calendar dates are local', () => {
  it('counts days to a date-only value without a timezone shift', () => {
    const today = new Date()
    const in3 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)
    expect(daysUntil(localISODate(in3))).toBe(3)
  })
})

describe('A failed token refresh', () => {
  beforeEach(() => {
    vi.resetModules()
    sessionStorage.setItem('rosterly_access_token', 'old')
    sessionStorage.setItem('rosterly_refresh_token', 'refresh')
  })
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  const run = async (refreshStatus: number) => {
    const axios = (await import('axios')).default
    const { apiClient } = await import('@/lib/api-client')
    // The refresh goes through plain axios; fake it there too, so nothing touches the network.
    vi.spyOn(axios, 'post').mockImplementation(async (url: string) => {
      const config = { url } as never
      throw Object.assign(new Error(`status ${refreshStatus}`), {
        isAxiosError: true,
        config,
        response: { status: refreshStatus, data: {}, headers: {}, config, statusText: '' },
      })
    })
    apiClient.defaults.adapter = async (config) => {
      const url = config.url ?? ''
      const status = url.includes('/auth/refresh') ? refreshStatus : 401
      const err = Object.assign(new Error(`status ${status}`), {
        isAxiosError: true,
        config,
        response: { status, data: {}, headers: {}, config, statusText: '' },
      })
      throw err
    }
    await apiClient.get('/assets').catch(() => undefined)
    return sessionStorage.getItem('rosterly_refresh_token')
  }

  it('keeps the session when the server is busy or unreachable', async () => {
    expect(await run(429)).toBe('refresh')
    expect(await run(503)).toBe('refresh')
  })

  it('signs out only when the refresh token is rejected', async () => {
    expect(await run(401)).toBeNull()
  })
})
