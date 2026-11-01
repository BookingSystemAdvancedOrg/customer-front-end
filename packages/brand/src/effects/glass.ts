/**
 * Refracting glass, as on booqy.se: on Chromium the SVG filter "booqy-glass"
 * bends what lies behind a glass surface (noise-driven displacement over a
 * light blur) and <html> gets .glass-refract so CSS can use it. Other
 * browsers ignore url() in backdrop-filter and keep the frosted blur.
 * Added once; safe to call from every app (same id and values everywhere).
 */
export function installGlassFilter(): void {
  if (typeof document === 'undefined' || document.getElementById('booqy-glass')) return
  if (!window.CSS?.supports?.('backdrop-filter', 'url(#x) blur(1px)') || !/Chrome\//.test(navigator.userAgent)) return
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.position = 'absolute'
  svg.innerHTML =
    '<filter id="booqy-glass" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="3" result="noise"/>' +
    '<feGaussianBlur in="noise" stdDeviation="2" result="soft"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="soft" scale="24" xChannelSelector="R" yChannelSelector="G"/></filter>'
  document.body.appendChild(svg)
  document.documentElement.classList.add('glass-refract')
}
