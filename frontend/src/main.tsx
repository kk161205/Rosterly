import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/app/App'
import { queryClient } from '@/lib/query-client'
// Self-hosted fonts (DESIGN.md): Geist for UI, Geist Mono for
// identifiers, Newsreader for page/panel titles and hero text only.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource/newsreader/500.css'
import '@fontsource/newsreader/600.css'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
