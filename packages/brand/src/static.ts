// The no-React build for booqy.se: built as one IIFE file (window.BooqyBrand)
// next to brand-static.css, copied into booqy-website/site/assets/brand/.
import './styles/static.css'
export { reducedMotion, easeOutExpo } from './effects/motion'
export { countUp, parseStatValue, formatStatValue } from './effects/countUp'
export { installGlassFilter } from './effects/glass'
export { installGlide, refreshGlide } from './effects/glide'
export { installPress, ripple } from './effects/press'
export { setSound, soundOn, setSoundVolume, soundVolume, playClick } from './effects/sound'
export { pourLiquid } from './effects/liquid'
export { setBarValue } from './effects/bar'
export { busyStart, busyEnd, withBusy } from './effects/busy'
export const version: string = __BRAND_VERSION__
