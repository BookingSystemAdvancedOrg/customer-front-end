import { useState } from 'react'

/**
 * En rätt sedd ovanifrån: bilden på en vit tallrik med kant. Utan bild (eller
 * om den inte laddar) står tallriken tom med rättens första bokstav i mitten,
 * så en meny utan foton ser lika ordnad ut som en med.
 */
export function Plate({
  src,
  name,
  size = 'md',
  position,
}: {
  src: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  /** CSS object-position (rättens fokuspunkt, menuImagePosition). */
  position?: string
}) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  return (
    <span className={`plate plate--${size}${showImage ? '' : ' plate--empty'}`} aria-hidden={showImage ? undefined : true}>
      {showImage ? (
        <img
          src={src!}
          alt={name}
          loading="lazy"
          decoding="async"
          style={position ? { objectPosition: position } : undefined}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="plate-initial">{name.trim().charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}
