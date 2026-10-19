/**
 * Booqys ordmärke i currentColor (samma teckning som admin och booqy.se),
 * för "Drivs av Booqy" i sidfoten. Namnet läses upp via title.
 */
export function BooqyWordmark({ height = 14, className }: { height?: number; className?: string }) {
  return (
    <svg
      className={className}
      height={height}
      width={Math.round(height * (416 / 180))}
      viewBox="52 191 416 180"
      role="img"
      focusable="false"
    >
      <title>Booqy</title>
      <g fill="none" stroke="currentColor" strokeWidth={14} strokeLinecap="round">
        <circle cx={104.5} cy={281.5} r={35.5} />
        <circle cx={186} cy={281.5} r={35.5} />
        <circle cx={265.5} cy={281.5} r={35.5} />
        <circle cx={345} cy={281.5} r={35.5} />
        <path d="M66.5 205.5V311.5" />
        <path d="M379 281.5V351" />
        <path d="M387 240 424 315" />
        <path d="M453 238 405 356" />
      </g>
      <g fill="currentColor">
        <path d="M84 280.5A20.5 20.5 0 0 1 125 280.5Z" />
        <rect x={79.5} y={282.5} width={50} height={5} />
      </g>
    </svg>
  )
}
