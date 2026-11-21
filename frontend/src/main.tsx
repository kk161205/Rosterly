import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/app/App'
import { queryClient } from '@/lib/query-client'
// Self-hosted fonts: Geist for UI, Geist Mono for
// identifiers, Newsreader for page/panel titles and hero text only.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource/newsreader/500.css'
import '@fontsource/newsreader/600.css'
import './styles/globals.css'
import { authStorage } from '@/lib/authStorage'
import { restoreAccent } from '@/lib/accent'

// Start in the person's colour (no flash of navy) — only when signed in; the sign-in page stays navy.
if (authStorage.getAccessToken() || authStorage.getRefreshToken()) restoreAccent()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
