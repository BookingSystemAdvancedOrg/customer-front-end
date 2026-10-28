/**
 * Ett litet pappersregn när något gick i lås: fjorton små pappersbitar som
 * faller en gång (1,1 s) inuti kvittot. Ren dekoration (aria-hidden) och
 * helt stilla för den som bett om mindre rörelse (prefers-reduced-motion i
 * world.css). Montera den med en key som byts när ögonblicket ska spelas igen.
 */
export function Celebrate() {
  return (
    <span className="confetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <i key={i} style={{ ['--i' as string]: i }} />
      ))}
    </span>
  )
}
