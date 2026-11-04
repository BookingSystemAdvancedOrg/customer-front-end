# site-builder-render

The Render step of the site builder publish workflow (ADR-B 3,
`infrastructure/site-builder/`). Pre-renders one published version with
site-kit's own `SitePage` (`react-dom/server`, one renderer, no drift) into
the customer app's `index.html` and writes it, `site.json` and the app's
hashed assets under `sites/<tenantId>/v/<versionNo>/` (immutable). Promote
(the Python site-builder Lambda) then copies the pages to the root.

- `src/render.mjs` pure object builder (tested: `npm test`, node's own runner)
- `src/entry.tsx` SSR entry, bundled by `npm run build` (Vite SSR) into `dist/entry.mjs`
- `src/index.mjs` the handler (DynamoDB GetItem, S3 PutObject)
- `Dockerfile` built from the repo root; pushed to the `site-builder-render`
  ECR repository. **Owner action:** add the build/push job to this repo's
  pipeline (ADR-B open question 1); until then the function runs the
  placeholder image and a publish fails at Render (feature off everywhere).

Not a root workspace (OWNERSHIP.md B); it uses the root's dev dependencies.
