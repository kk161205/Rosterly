import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Several components (e.g. EmployeeProfileDrawer, AssetDetailDrawer) render
// via createPortal(..., document.body) rather than into the RTL container.
// RTL's automatic cleanup unmounts the React tree, but a portal left mid-
// animation/async-update by a preceding test's last render can still leave
// stray nodes attached directly to document.body — and because Vitest reuses
// worker threads (and their jsdom `document`) across test files, that residue
// can bleed into a *different* file's test run, causing order-dependent
// failures (e.g. duplicate-text / element-not-found) that don't reproduce
// when the file is run in isolation. Explicit cleanup + a hard DOM reset
// after every test closes that gap.
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})
