import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import App from './App'
import './styles/index.css'

const routerBasePath = new URL(import.meta.env.BASE_URL || '/', window.location.origin).pathname.replace(/\/+$/, '')

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={routerBasePath || undefined}>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </BrowserRouter>
)
