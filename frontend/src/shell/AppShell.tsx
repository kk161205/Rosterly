import React, { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import * as RadixDialog from '@radix-ui/react-dialog'
import { Menu as MenuIcon, Search, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { CURRENT_USER_KEY, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { MfaSetupRequired } from '@/features/auth/components/MfaSetupRequired'
import type { UserProfile } from '@/features/auth/types/auth'
import { MFA_REQUIRED_EVENT } from '@/lib/api-client'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useInbox } from '@/features/inbox/hooks/useInbox'
import { authStorage } from '@/lib/authStorage'
import { Button, EmptyState, IconButton, Logo } from '@/ui'
import { CommandPalette } from '@/shell/CommandPalette'
import { SectionTabs } from '@/shell/SectionTabs'
import { Sidebar } from '@/shell/Sidebar'
import { NotificationFlyout } from '@/features/notifications/components/NotificationFlyout'
import { activeLink, activeSection, canOpen, visibleNav } from '@/shell/nav'
import { GuideProvider, useGuide } from '@/guide/GuideProvider'
import { GuideLauncher } from '@/guide/GuideLauncher'

/**
 * The signed-in frame for every page:
 * tinted sidebar with a flat nav on desktop, a top bar with a drawer below
 * 1024px, the Search-or-ask box (Ctrl K, "/", or the logo's tile), and
 * section tabs when a section has several pages.
 */
export const AppShell: React.FC = () => {
  const hasSession = Boolean(authStorage.getAccessToken() || authStorage.getRefreshToken())
  const { user } = useCurrentUser(hasSession)
  const desktop = useMediaQuery('(min-width: 1024px)') // one notification bell: sidebar on desktop, top bar on phones
  const queryClient = useQueryClient()
  // The API refused a call because two-step sign-in must be set up first:
  // re-read who we are so the setup screen appears.
  useEffect(() => {
    const onRequired = () => void queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY })
    window.addEventListener(MFA_REQUIRED_EVENT, onRequired)
    return () => window.removeEventListener(MFA_REQUIRED_EVENT, onRequired)
  }, [queryClient])

  if (!hasSession) return <Navigate to="/login" replace />
  if (user?.mfa_setup_required) return <MfaSetupRequired />

  return (
    <GuideProvider user={user} desktop={desktop}>
      <ShellFrame user={user} desktop={desktop} />
    </GuideProvider>
  )
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

const NoAccess: React.FC = () => {
  const navigate = useNavigate()
  return (
    <EmptyState
      title="You don’t have access to this page"
      description="It isn’t part of your role. Ask an admin if you need it."
      action={
        <Button variant="secondary" onClick={() => navigate('/home')}>
          Go home
        </Button>
      }
    />
  )
}

const ShellFrame: React.FC<{ user: UserProfile | null; desktop: boolean }> = ({ user, desktop }) => {
  const location = useLocation()
  const inbox = useInbox(Boolean(user))
  const guide = useGuide()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { boxOpen, setBoxOpen } = guide

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBoxOpen(!boxOpen)
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !boxOpen && !typing(e.target)) {
        e.preventDefault()
        setBoxOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [boxOpen, setBoxOpen])

  const sections = visibleNav(user)
  const section = activeSection(sections, location.pathname)
  const tab = section ? activeLink(section, location.pathname) : undefined
  const inboxCount = inbox.data?.items.length
  const openSearch = () => {
    setDrawerOpen(false)
    setBoxOpen(true)
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
        <Sidebar sections={sections} active={section} inboxCount={inboxCount} user={user} onSearch={openSearch} showBell={desktop} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-sidebar px-4 py-2 lg:hidden">
          <span className="relative inline-flex">
            <Logo markClassName="h-6 w-6" tileOut={guide.out} />
            <GuideLauncher />
          </span>
          <div className="flex items-center gap-1">
            {!desktop && <NotificationFlyout align="right" onNavigate={() => setDrawerOpen(false)} />}
            <IconButton label={guide.allowed ? 'Search or ask' : 'Search'} onClick={openSearch}>
              <Search className="h-5 w-5" />
            </IconButton>
            <IconButton label="Open menu" data-guide-menu="" onClick={() => setDrawerOpen(true)}>
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
            {canOpen(user, location.pathname) ? <Outlet /> : <NoAccess />}
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

      <CommandPalette
        open={boxOpen}
        onOpenChange={setBoxOpen}
        sections={sections}
        user={user}
        canAsk={guide.allowed}
        onAsk={guide.ask}
        canSpeak={guide.voice}
      />
    </div>
  )
}
