import { mkdir, copyFile } from 'node:fs/promises';
// Explicit public-file allowlist: never publish backend source, SQL, or secrets.
for (const file of ['index.html', 'admin/index.html', 'admin/shipping.js', 'admin/shippo.js', 'data/site.json']) {
  const destination = new URL(`../dist/${file}`, import.meta.url);
  await mkdir(new URL('.', destination), { recursive: true });
  await copyFile(new URL(`../${file}`, import.meta.url), destination);
}
await copyFile(new URL('../cloudflare/_headers', import.meta.url), new URL('../dist/_headers', import.meta.url));
