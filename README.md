# customer-front-end
this is the front end repository for the customers

Kundernas publika sajt: startsida med öppettider/kontakt och menysidan som
hämtar restaurangens meny från backend-API:t. Vite + React + TypeScript,
samma struktur och designtokens som `admin-front-end`.

## Kom igång lokalt

```bash
npm install
cp .env.example .env   # fyll i VITE_API_BASE_URL och VITE_LOCATION_ID
npm run dev            # http://localhost:7071
```

Restaurangens visningsuppgifter (namn, adress, öppettider) redigeras i
`src/shared/restaurant.ts` tills backend har en publik plats-endpoint.

## Säkerhetsmodell

Sajten är **helt publik och skrivskyddad** - den är byggd så att den inte
ens *kan* skriva:

- **Inga hemligheter i repot eller bundeln.** Ingen Cognito-konfiguration,
  inga tokens, inga API-nycklar. Allt `VITE_`-prefixat är publikt per
  definition och behandlas så.
- **Enbart publika GET-rutter.** API-lagret (`src/shared/api.ts`) exponerar
  bara `apiGet` - det finns ingen kodväg för POST/PUT/DELETE och ingen
  Authorization-header skickas någonsin. Enda rutten som används är
  `GET /locations/{id}/menu`, som backend håller öppen utan inloggning.
  Behörighetsgränsen ligger alltså kvar hos API:ts JWT-authorizer - den
  här appen har inget att läcka.
- **CSP i `index.html`** låser `connect-src` till API Gateway och `img-src`
  till menybildernas CDN; inga externa skript alls. Sätt gärna samma CSP
  (plus `frame-ancestors 'none'`) som riktiga svarshuvuden i CloudFronts
  response headers policy - meta-taggen är ett skyddsnät, inte en
  ersättning.
- **Inaktiva rätter filtreras även klientsidigt** om servern skulle skicka
  med dem.

## CI/CD

Two workflows, `dev.yml` (branch `dev`) and `prod.yml` (branch `main`), both calling the shared `reusable_cicd.yml`. Authenticates to AWS via GitHub OIDC - no long-lived AWS keys stored anywhere.

- **PR into `dev` or `main`** → install/lint/test/build only. Never touches AWS - this is the review gate.
- **Push to `dev`** (merge) → full run: build, sync `dist/` to the dev S3 bucket, invalidate the dev CloudFront distribution.
- **Push to `main`** (merge) → same, against prod.

All non-secret config - both environments' OIDC role ARNs, S3 bucket names, CloudFront distribution IDs, AWS region - lives in `.github/config/project.env`, committed to the repo. None of these values are secrets: the role ARNs are only useful to something that can already present a valid GitHub OIDC token for this repo, and the bucket/distribution IDs aren't sensitive on their own. This is the same pattern the `infrastructure` repo uses for its own `project.env` - see that repo for how the S3 bucket, CloudFront distribution, and IAM role are provisioned.

### Build assumption

The `build` script (`npm run build`) is expected to emit a Vite-style `dist/` folder: `dist/index.html` plus hashed, content-addressed files under `dist/assets/*`. The deploy step relies on that exact layout to set cache headers correctly (assets cached forever, `index.html` never cached). If the app doesn't use Vite, either match this output shape or adjust the "Deploy dist/ to S3" step in `reusable_cicd.yml`.

### Setup checklist

1. `infrastructure` repo has already been applied for both `dev` and `prod` - this provisions the S3 bucket, CloudFront distribution, and the OIDC deploy role this pipeline assumes.
2. Fill in `CLOUDFRONT_DISTRIBUTION_ID_DEV` and `CLOUDFRONT_DISTRIBUTION_ID_PROD` in `.github/config/project.env` - get the real values from the infrastructure repo with `terraform output -raw customer_cloudfront_distribution_id` (once per environment's state). The pipeline fails fast with a clear error if either is left as the placeholder.
3. Open a PR to confirm the workflow installs/lints/tests/builds cleanly, then push to `dev` to do a real deploy, then to `main` for prod.
