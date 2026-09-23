import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CartProvider } from './shared/cart'
import { LocationInfoProvider } from './shared/locationInfo'
import { RESTAURANT } from './shared/restaurant'
import './index.css'

document.title = RESTAURANT.name

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LocationInfoProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </LocationInfoProvider>
    </BrowserRouter>
  </StrictMode>,
)
