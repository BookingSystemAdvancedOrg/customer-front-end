import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import logoImg from '../../assets/anar/logo.png'
import 'leaflet/dist/leaflet.css'
import { ANAR, PARKING_LOTS, googleMapsSearchUrl } from './parkingData'

const ANAR_ICON_SIZE = 44

const anarIcon = L.icon({
  iconUrl: logoImg,
  iconSize: [ANAR_ICON_SIZE, ANAR_ICON_SIZE],
  iconAnchor: [ANAR_ICON_SIZE / 2, ANAR_ICON_SIZE / 2],
  popupAnchor: [0, -ANAR_ICON_SIZE / 2],
  className: 'parking-anar-marker',
})

const parkingIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 })
  }, [map, points])
  return null
}

/** Karta över Anar och närliggande parkeringar (Figma-förlaga: anars ParkingMap.jsx). */
export default function ParkingMap() {
  const fitPoints = useMemo(
    () => [{ lat: ANAR.lat, lng: ANAR.lng }, ...PARKING_LOTS.map((l) => ({ lat: l.lat, lng: l.lng }))],
    [],
  )

  return (
    <MapContainer
      className="parking-leaflet"
      center={[ANAR.lat, ANAR.lng]}
      zoom={16}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      keyboard={false}
      touchZoom={false}
      zoomControl={false}
      aria-label="Karta med Anar och parkeringar"
    >
      <FitBounds points={fitPoints} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Marker position={[ANAR.lat, ANAR.lng]} icon={anarIcon}>
        <Popup>
          <strong>{ANAR.label}</strong>
          <br />
          {ANAR.address}
          <br />
          <a href={googleMapsSearchUrl(ANAR.address)} target="_blank" rel="noopener noreferrer">
            Google Maps
          </a>
        </Popup>
      </Marker>

      {PARKING_LOTS.map((lot) => (
        <Marker key={lot.address} position={[lot.lat, lot.lng]} icon={parkingIcon}>
          <Popup>
            <strong>{lot.name}</strong>
            <br />
            ~{lot.distanceM} m från Anar · {lot.spaces} platser
            <br />
            {lot.address}
            <br />
            <a href={googleMapsSearchUrl(lot.address)} target="_blank" rel="noopener noreferrer">
              Google Maps
            </a>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
