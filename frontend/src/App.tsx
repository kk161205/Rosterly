import { BrowserRouter, Routes, Route } from 'react-router-dom'

/**
 * Pages get registered here as they're built — one route per page from
 * ROSTERLY_PROJECT_DOCUMENTATION.md §5. Do not add a page here with a
 * hardcoded/mock version of its data (rules.md §1.1) — build the real
 * page against the real backend endpoint, or leave it unbuilt.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <div className="flex min-h-screen items-center justify-center">
              <p className="font-sans text-headline-lg text-primary">
                Rosterly — scaffold running. Start building pages per
                ROSTERLY_PROJECT_DOCUMENTATION.md §5.
              </p>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
