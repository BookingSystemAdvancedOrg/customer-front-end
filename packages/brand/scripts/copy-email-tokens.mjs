// Copies the generated email values next to the build (dist/), where the
// published package exposes them as @booqy/brand/email-tokens.json and
// dist/booqy_brand_tokens.py.
import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const name of ['email-tokens.json', 'booqy_brand_tokens.py']) copyFileSync(join(root, 'src/generated', name), join(root, 'dist', name))
