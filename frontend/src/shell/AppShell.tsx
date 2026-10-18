import React, { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import * as RadixDialog from '@radix-ui/react-dialog'
import { Menu as MenuIcon, Search, X } from 'lucide-react'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { useInbox } from '@/features/inbox/hooks/useInbox'
import { authStorage } from '@/lib/authStorage'
import { IconButton, Logo } from '@/ui'
import { CommandPalette } from '@/shell/CommandPalette'
import { SectionTabs } from '@/shell/SectionTabs'
import { Sidebar } from '@/shell/Sidebar'
import { activeLink, activeSection, visibleNav } from '@/shell/nav'

/**
 * The signed-in frame for every page (§4, DESIGN.md, Layout):
 * tinted sidebar with a flat nav on desktop, a top bar with a drawer below
 * 1024px, Ctrl K search, and section tabs when a section has several pages.
 */
export const AppShell: React.FC = () => {
  const location = useLocation()
  const hasSession = Boolean(authStorage.getAccessToken() || authStorage.getRefreshToken())
  const { user } = useCurrentUser()
  const inbox = useInbox(Boolean(user))
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!hasSession) return <Navigate to="/login" replace />

  const sections = visibleNav(user)
  const section = activeSection(sections, location.pathname)
  const tab = section ? activeLink(section, location.pathname) : undefined
  const inboxCount = inbox.data?.items.length
  const openSearch = () => {
    setDrawerOpen(false)
    setPaletteOpen(true)
  }

  return (
    <div className="flex min-h-screen bg-sidebar text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-pill bg-navy px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
        <Sidebar sections={sections} active={section} inboxCount={inboxCount} user={user} onSearch={openSearch} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-sidebar px-4 py-2 lg:hidden">
          <Logo markClassName="h-6 w-6" />
          <div className="flex items-center">
            <IconButton label="Search" onClick={openSearch}>
              <Search className="h-5 w-5" />
            </IconButton>
            <IconButton label="Open menu" onClick={() => setDrawerOpen(true)}>
              <MenuIcon className="h-5 w-5" />
            </IconButton>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-paper focus:outline-none">
          <div className="mx-auto w-full max-w-screen-xl px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
            {section && section.links.length > 1 && (
              <div className="mb-7">
                <SectionTabs section={section} active={tab} />
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>

      <RadixDialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/30 lg:hidden" />
          <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] focus:outline-none lg:hidden">
            <RadixDialog.Title className="sr-only">Menu</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">Main navigation</RadixDialog.Description>
            <RadixDialog.Close asChild>
              <IconButton label="Close menu" className="absolute right-2 top-3 z-10">
                <X className="h-5 w-5" />
              </IconButton>
            </RadixDialog.Close>
            <Sidebar
              sections={sections}
              active={section}
              inboxCount={inboxCount}
              user={user}
              onSearch={openSearch}
              onNavigate={() => setDrawerOpen(false)}
            />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} sections={sections} user={user} />
    </div>
  )
}
