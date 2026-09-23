/**
 * Parkeringsdata (portad från github.com/AryaEisa/anar). Koordinater från
 * OpenStreetMap (Nominatim), ungefärliga punkter per adress. Statisk
 * innehåll - det finns ingen backend-endpoint för parkeringsplatser.
 */

export interface ParkingLot {
  distanceM: number
  name: string
  spaces: number
  address: string
  lat: number
  lng: number
}

export const ANAR = {
  label: 'Anar Restaurang & Bar',
  address: 'Djurgårdsgatan 33A, 582 29 Linköping',
  lat: 58.404871,
  lng: 15.6169385,
}

export const PARKING_LOTS: ParkingLot[] = [
  {
    distanceM: 100,
    name: 'Tränggatan 5',
    spaces: 12,
    address: 'Tränggatan 5, 582 28 Linköping',
    lat: 58.4053132,
    lng: 15.6155168,
  },
  {
    distanceM: 140,
    name: 'Barnhemsgatan 23',
    spaces: 32,
    address: 'Barnhemsgatan 23, 582 30 Linköping',
    lat: 58.4061613,
    lng: 15.6168917,
  },
  {
    distanceM: 180,
    name: 'ICA Nära Djurgårdsgatan',
    spaces: 8,
    address: 'Djurgårdsgatan 18, 582 29 Linköping',
    lat: 58.4067234,
    lng: 15.6173807,
  },
  {
    distanceM: 280,
    name: 'Föreningsgatan',
    spaces: 17,
    address: 'Föreningsgatan 33, 587 53 Linköping',
    lat: 58.4036004,
    lng: 15.6158368,
  },
  {
    distanceM: 400,
    name: 'US Norra',
    spaces: 317,
    address: 'Lasarettsgatan 9, 582 25 Linköping',
    lat: 58.4043315,
    lng: 15.6204152,
  },
]

export function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
