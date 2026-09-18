import { createContext } from 'react'

export interface CartItem {
  menuItemId: string
  name: string
  price: number
  quantity: number
}

export interface CartContextValue {
  items: CartItem[]
  count: number
  total: number
  add: (item: Omit<CartItem, 'quantity'>) => void
  setQuantity: (menuItemId: string, quantity: number) => void
  clear: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)
