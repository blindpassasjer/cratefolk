import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth'
import { NotifyProvider } from './notify'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NotifyProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NotifyProvider>
    </BrowserRouter>
  </StrictMode>,
)
