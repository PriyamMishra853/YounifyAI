import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/martian-mono/standard.css'
import './styles/index.css'
import App from './App'
import { detectApi } from './lib/api'

// decide between the server and the in-browser API before anything asks for data
detectApi().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
