import type { ReactNode } from 'react'
import type { Lang } from './languages'

/**
 * Små flaggor (20 x 15) för språkväljaren, som SVG i paketet: inga emojier
 * (Windows visar dem som bokstäver) och inga bildanrop. En flagga står för
 * ett land, inte ett språk, så väljaren visar alltid språkets eget namn
 * bredvid. Sajten kan byta flagga per språk (LanguagePicker `flags`).
 *
 * - sv Sverige, en Storbritannien, es Spaniens civila flagga (utan vapen).
 * - ar Arabförbundet (grön med förenklat vitt emblem, ingen text).
 * - fa grön-vit-röd trikolor utan emblem (varken dagens emblem eller lejonet
 *   och solen, som betyder motsatta saker för många).
 */

const FLAGS: Record<Lang, ReactNode> = {
  sv: (
    <>
      <rect width="20" height="15" fill="#006aa7" />
      <rect x="6" width="2.5" height="15" fill="#fecc02" />
      <rect y="6.25" width="20" height="2.5" fill="#fecc02" />
    </>
  ),
  en: (
    <>
      <rect width="20" height="15" fill="#012169" />
      <path d="M0 0 20 15M20 0 0 15" stroke="#fff" strokeWidth="3" />
      <path d="M0 0 20 15M20 0 0 15" stroke="#c8102e" strokeWidth="1.2" />
      <path d="M10 0v15M0 7.5h20" stroke="#fff" strokeWidth="4.4" />
      <path d="M10 0v15M0 7.5h20" stroke="#c8102e" strokeWidth="2.4" />
    </>
  ),
  es: (
    <>
      <rect width="20" height="15" fill="#aa151b" />
      <rect y="3.75" width="20" height="7.5" fill="#f1bf00" />
    </>
  ),
  ar: (
    <>
      <rect width="20" height="15" fill="#007a3d" />
      <circle cx="10" cy="7.5" r="4" fill="none" stroke="#fff" strokeWidth="0.9" strokeDasharray="1.1 0.6" />
      <path d="M11.4 5.6a2.3 2.3 0 1 0 0 3.8 1.9 1.9 0 1 1 0-3.8Z" fill="#fff" />
    </>
  ),
  fa: (
    <>
      <rect width="20" height="15" fill="#fff" />
      <rect width="20" height="5" fill="#239f40" />
      <rect y="10" width="20" height="5" fill="#da0000" />
    </>
  ),
}

export function Flag({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <svg
      className={`lang-flag${className ? ` ${className}` : ''}`}
      viewBox="0 0 20 15"
      width="20"
      height="15"
      aria-hidden="true"
      focusable="false"
    >
      {FLAGS[lang]}
      <rect x="0.5" y="0.5" width="19" height="14" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.2" />
    </svg>
  )
}
