import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppErrorBoundary } from './components/ErrorBoundaries.tsx'

const { default: App } = import.meta.env.VITE_PORTFOLIO_ATLAS === '1'
  ? await import('./PortfolioApp.tsx')
  : await import('./App.tsx')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
