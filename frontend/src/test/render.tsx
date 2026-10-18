import React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { authService } from '@/features/auth/services/authService'
import type { UserProfile } from '@/features/auth/types/auth'

/**
 * Render a page with a fresh query cache and router. `path` is the route
 * pattern (e.g. "/assets/:id"), `route` the URL to open.
 * Call mockUser() first — pages read permissions from GET /auth/me.
 */
export function renderPage(ui: React.ReactElement, { route = '/', path = '*' }: { route?: string; path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export function mockUser(role: string, permissions: string[], overrides: Partial<UserProfile> = {}) {
  vi.mocked(authService.getCurrentUser).mockResolvedValue({
    id: 'me',
    email: 'me@example.com',
    full_name: 'Test User',
    role,
    permissions,
    ...overrides,
  })
}

export const IT_ADMIN = [
  'assets:read', 'assets:create', 'assets:update', 'assets:bulk_update', 'assets:lookup',
  'maintenance_ticket:read', 'maintenance_ticket:create', 'maintenance_ticket:update',
  'request:create', 'request:read', 'request:approve',
  'analytics:savings', 'analytics:cost_by_department', 'analytics:budget_forecast', 'analytics:turnaround',
]
