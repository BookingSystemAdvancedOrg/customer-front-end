/**
 * "Ny version finns": visar en glasruta med knappen Ladda om när en ny
 * version är deployad. Laddar aldrig om av sig själv, så inget osparat går
 * förlorat (sidans egen varning före stängning gäller som vanligt).
 *
 * Hur en ny version upptäcks: deployen skriver index.html med no-cache och
 * gör en CloudFront-invalidering, medan allt annat cachas i ett år. Därför
 * jämförs index.html:s ETag (innehållets MD5 från S3), inte en version.json
 * som skulle fastna i cachen. Kontroll var 60:e sekund medan fliken syns och
 * direkt när fönstret får fokus igen.
 *
 * Fastnar aldrig: versionskontrollen ges högst 10 s, färska filer högst 3 s,
 * och lever sidan kvar 8 s efter reload() (30 s om bytet börjat) kommer
 * knappen tillbaka med "Kunde inte ladda om. Försök igen."
 *
 * Samma fil finns i admin, konsolen och gästsajten; booqy.se har en
 * JS-kopia (site/assets/update-notice.js). Ändra alla tillsammans.
 */

const CHECK_EVERY_MS = 60_000
const STYLE_ID = 'booqy-update-style'
/** Längsta väntan på versionskontrollen, så en fastnad förfrågan aldrig stoppar senare kontroller. */
const VERSION_TIMEOUT_MS = 10000
/** Längsta väntan på färska filer innan omladdningen ändå sker. */
const FETCH_TIMEOUT_MS = 3000
/** Lever sidan kvar så här länge efter reload() har något stoppat bytet: knappen tillbaka. */
const FAILSAFE_MS = 8000
/** Har bytet börjat (beforeunload utan stopp) väntas längre. */
const SLOW_RELOAD_MS = 30000

const CSS = `
.booqy-update{position:fixed;z-index:2147483000;left:50%;bottom:max(16px,env(safe-area-inset-bottom));
transform:translateX(-50%);display:flex;align-items:center;gap:12px;
width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 10px 10px 18px;
border-radius:16px;border:1px solid var(--glass-edge,rgba(253,250,246,.55));
background:var(--glass-pop,rgba(251,250,246,.74));color:var(--ink,#1c1918);
-webkit-backdrop-filter:blur(20px) saturate(1.5);backdrop-filter:blur(20px) saturate(1.5);
box-shadow:0 14px 34px -12px rgba(28,25,24,.45),inset 0 1px 0 rgba(253,250,246,.6);
font:600 0.95rem/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;animation:booqy-update-in .42s cubic-bezier(.16,1,.3,1)}
.booqy-update__text{flex:1 1 auto}
.booqy-update__note{display:block;font-weight:500;font-size:.82rem;opacity:.75}
.booqy-update__reload{appearance:none;border:0;border-radius:999px;padding:9px 16px;cursor:pointer;
background:#1c1918;color:#fbfaf6;font:inherit;font-weight:700;white-space:nowrap}
.booqy-update__reload:hover{background:#350001}
.booqy-update__reload:focus-visible,.booqy-update__close:focus-visible{outline:2px solid #9e1d26;outline-offset:2px}
.booqy-update__close{appearance:none;border:0;background:transparent;color:inherit;opacity:.7;cursor:pointer;
width:32px;height:32px;border-radius:999px;font:inherit;font-size:1.15rem;line-height:1}
.booqy-update__close:hover{opacity:1}
[data-theme="dark"] .booqy-update{background:var(--glass-pop,rgba(31,22,18,.78));color:#f6ece9;
border-color:var(--glass-edge,rgba(246,236,233,.16));box-shadow:0 14px 34px -12px rgba(0,0,0,.7),inset 0 1px 0 rgba(246,236,233,.08)}
[data-theme="dark"] .booqy-update__reload{background:#fbfaf6;color:#1c1918}
[data-theme="dark"] .booqy-update__reload:hover{background:#f6ece9}
@media (prefers-reduced-motion:reduce){.booqy-update{animation:none}}
@keyframes booqy-update-in{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
`

export type UpdateNoticeLabels = { text: string; reload: string; reloading: string; later: string; hint: string; failed: string }

/** Svenska som standard; konsolen (engelskt gränssnitt) skickar egna. */
const SV: UpdateNoticeLabels = {
  text: 'Ny version finns',
  reload: 'Ladda om',
  reloading: 'Laddar om...',
  later: 'Inte nu',
  hint: 'Hämtar den nya versionen. Spara först det du håller på med.',
  failed: 'Kunde inte ladda om. Försök igen.',
}

export type UpdateNoticeOptions = {
  /** Filen (eller filerna) vars ETag jämförs. booqy.se skickar sidan, css och js. */
  url?: string | string[]
  intervalMs?: number
  labels?: Partial<UpdateNoticeLabels>
}

/** Läser versionen (ETag, annars Last-Modified) förbi alla cacher. */
export async function readVersion(url: string | string[]): Promise<string | null> {
  const urls = Array.isArray(url) ? url : [url]
  const abort = new AbortController()
  let timer = 0
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      abort.abort()
      reject(new Error('timeout'))
    }, VERSION_TIMEOUT_MS)
  })
  try {
    const parts = await Promise.race([
      Promise.all(
        urls.map(async (u) => {
          const res = await fetch(u, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: abort.signal })
          if (!res.ok) return null
          return res.headers.get('etag') ?? res.headers.get('last-modified')
        }),
      ),
      timeout,
    ])
    return parts.some((p) => p === null) ? null : parts.join('|')
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Hämtar om sidans egna skript och stilmallar förbi webbläsarens cache (högst
 * 3 s) och laddar sedan om. Filer med hash i namnet byts ändå, men utan hash (som på
 * booqy.se) kunde en vanlig omladdning annars visa gammal kod en stund.
 */
export async function reloadFresh(): Promise<void> {
  const urls = new Set<string>()
  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((s) => urls.add(s.src))
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((l) => urls.add(l.href))
  const own = [...urls].filter((u) => {
    try {
      return new URL(u).origin === location.origin
    } catch {
      return false
    }
  })
  const abort = new AbortController()
  const timer = window.setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS)
  await Promise.allSettled(own.map((u) => fetch(u, { cache: 'reload', credentials: 'same-origin', signal: abort.signal })))
  window.clearTimeout(timer)
  location.reload()
}

function showNotice(labels: UpdateNoticeLabels, onDismiss: () => void): void {
  if (document.querySelector('.booqy-update')) return
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }
  const box = document.createElement('div')
  box.className = 'booqy-update'
  box.setAttribute('role', 'status')
  box.setAttribute('aria-live', 'polite')

  const text = document.createElement('span')
  text.className = 'booqy-update__text'
  text.textContent = labels.text

  const reload = document.createElement('button')
  reload.type = 'button'
  reload.className = 'booqy-update__reload'
  reload.textContent = labels.reload
  reload.title = labels.hint
  const note = document.createElement('span')
  note.className = 'booqy-update__note'
  note.textContent = labels.failed

  reload.addEventListener('click', () => {
    reload.disabled = true
    reload.textContent = labels.reloading
    note.remove()
    // Lever sidan kvar efter reload() har något stoppat bytet (t.ex. en
    // lämna-spärr): knappen tillbaka, aldrig ett evigt "Laddar om...".
    let going = false
    const probe = (e: Event) => {
      going = !e.defaultPrevented
    }
    window.addEventListener('beforeunload', probe)
    const restore = () => {
      window.removeEventListener('beforeunload', probe)
      reload.disabled = false
      reload.textContent = labels.reload
      text.append(note)
    }
    void reloadFresh()
      .catch(() => undefined)
      .then(() => {
        window.setTimeout(() => {
          if (going) window.setTimeout(restore, SLOW_RELOAD_MS - FAILSAFE_MS)
          else restore()
        }, FAILSAFE_MS)
      })
  })

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'booqy-update__close'
  close.setAttribute('aria-label', labels.later)
  close.title = labels.later
  close.textContent = '×'
  close.addEventListener('click', () => {
    box.remove()
    onDismiss()
  })

  box.append(text, reload, close)
  document.body.appendChild(box)
}

/** Startar kontrollen. Returnerar en funktion som stoppar den. */
export function startUpdateNotice(options: UpdateNoticeOptions = {}): () => void {
  const url = options.url ?? '/index.html'
  const intervalMs = options.intervalMs ?? CHECK_EVERY_MS
  const labels: UpdateNoticeLabels = { ...SV, ...options.labels }
  let baseline: string | null = null
  let latest: string | null = null
  let running = false

  const check = async () => {
    if (running) return
    // Första kontrollen (utgångsläget) görs även i en dold flik.
    if (baseline !== null && document.visibilityState !== 'visible') return
    running = true
    try {
      const version = await readVersion(url)
      if (!version) return
      if (baseline === null) baseline = version
      else if (version !== baseline && version !== latest) {
        latest = version
        // "Inte nu" gömmer rutan tills nästa nya version.
        showNotice(labels, () => {
          baseline = latest
        })
      }
    } catch {
      /* offline eller blockerat: försök vid nästa tillfälle */
    } finally {
      running = false
    }
  }

  void check()
  const timer = window.setInterval(() => void check(), intervalMs)
  const onFocus = () => void check()
  const onVisible = () => document.visibilityState === 'visible' && void check()
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
