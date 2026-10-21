/* Ljust eller mörkt läge, satt innan sidan ritas så att inget blinkar.
   Gästens val ligger i localStorage under "booqy-theme" (src/shared/theme.ts
   och storageRegistry.ts); utan val följer sajten systemets inställning.
   Vanligt, blockerande skript (inte module) så att det hinner före första
   bildrutan, och en egen fil eftersom sidans CSP bara tillåter
   script-src 'self'. Filen cachas i ett år under sitt namn: ändras den,
   höj versionen i filnamnet och i index.html. */
;(function (root) {
  var theme = null
  try {
    theme = localStorage.getItem('booqy-theme')
  } catch {
    /* privat läge utan lagring */
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  root.setAttribute('data-theme', theme)
  // Webbläsarens egen ram (meta theme-color) följer skrivbordet.
  var metas = document.querySelectorAll('meta[name="theme-color"]')
  for (var i = 0; i < metas.length; i++) {
    metas[i].setAttribute('content', theme === 'dark' ? '#1c1918' : '#f1eee6')
  }
})(document.documentElement)
