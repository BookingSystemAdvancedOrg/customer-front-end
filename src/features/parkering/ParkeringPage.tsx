import ParkingMap from './ParkingMap'
import { ANAR, PARKING_LOTS, googleMapsSearchUrl } from './parkingData'

/**
 * Parkering (Figma-förlaga: anars parkering-sida, github.com/AryaEisa/anar).
 * Helt statiskt innehåll - det finns ingen backend-endpoint för
 * parkeringsplatser, så listan och kartpunkterna kommer från parkingData.ts.
 */
export default function ParkeringPage() {
  const sorted = [...PARKING_LOTS].sort((a, b) => a.distanceM - b.distanceM)

  return (
    <>
      <section className="photo-hero">
        <p className="hero-kicker">Hitta plats</p>
        <h1>Parkering</h1>
        <p className="hero-sub">
          Parkeringsmöjligheter i närheten av Anar. Avstånden är ungefärliga
          promenadavstånd från restaurangen. På kartan markerar Anar-logotypen
          restaurangen, blå nål = parkering.
        </p>
      </section>

      <section className="glass-panel" aria-labelledby="parking-map-heading">
        <h2 id="parking-map-heading">Karta</h2>
        <p>
          Alla platser och <strong>Anar</strong> ({ANAR.address}) visas som
          punkter. Klicka på en punkt för detaljer.
        </p>
        <div className="parking-map-frame">
          <ParkingMap />
        </div>
        <p className="parking-map-attrib">
          Kartdata ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>
        </p>
      </section>

      <section className="glass-panel" aria-labelledby="parking-list-heading">
        <h2 id="parking-list-heading">Platser och avstånd</h2>
        <ul className="parking-list">
          {sorted.map((lot) => (
            <li key={lot.address} className="parking-card">
              <div className="parking-card-top">
                <span className="parking-distance">{lot.distanceM} m</span>
                <span className="parking-spaces">{lot.spaces} platser</span>
              </div>
              <h3>{lot.name}</h3>
              <p>{lot.address}</p>
              <a href={googleMapsSearchUrl(lot.address)} target="_blank" rel="noopener noreferrer">
                Visa på Google Maps
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
