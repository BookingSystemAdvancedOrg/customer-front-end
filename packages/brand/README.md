# @booqy/brand

Booqy's shared brand system: one source of tokens, the effects, one Bar
family and one of each shared component, for admin, the console, the guest
sites (restaurant theme) and booqy.se. The catalogue, when to use what and
the theming model are in `infrastructure/docs/design/DESIGN.md`; how each
repo gets the package is in `infrastructure/docs/adr/ADR-BRAND-sharing.md`.

```tsx
import '@booqy/brand/styles.css'
import { Bar, Button, installPress, installGlassFilter } from '@booqy/brand'

installPress()
installGlassFilter()

<Bar variant="progress" value={0.5} label="Steg" valueText="3 / 6" />
<Button variant="primary" type="submit">Spara</Button>
```

Guest sites put `data-bq-theme="restaurant"` on `<html>` (or a container):
the accent and fonts then come from the `--tenant-*` variables that
site-kit's `SiteProvider` sets, already contrast-nudged.

## Scripts

- `npm run tokens`: regenerate `src/generated/*` from `tokens.json`.
- `npm test` (`NODE_OPTIONS=--no-experimental-webstorage` on Node 26),
  `npm run typecheck`, `npm run lint`, `npm run build`.
- `npm run brand-lint -- <paths> [--block <glob>]`: see the script header.

Every class starts with `bq-` and every variable with `--bq-`, so the package
can sit next to an app's own styles while Run 3 migrates them.
