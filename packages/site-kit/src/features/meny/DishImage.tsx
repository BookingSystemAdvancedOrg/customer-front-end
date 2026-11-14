import { useState } from 'react'

/** Rättens bild med platshållare som reserv - samma mönster som admin. */
export function DishImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    // Neutral platshållare (ingen emoji): en tom ruta i sajtens ton.
    return <span className="dish-placeholder" aria-hidden="true" />
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
}
