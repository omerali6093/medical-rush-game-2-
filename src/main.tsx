import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ProfileProvider } from './store/profile'
import { AuthProvider } from './store/auth'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProfileProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ProfileProvider>
  </StrictMode>
)
