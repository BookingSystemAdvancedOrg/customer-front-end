import { useContext } from 'react'
import { LocationInfoContext } from './LocationInfoContext'
import type { LocationInfoState } from './LocationInfoContext'

export function useLocationInfo(): LocationInfoState {
  return useContext(LocationInfoContext)
}
