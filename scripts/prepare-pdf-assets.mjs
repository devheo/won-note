import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('public/pdfjs/', root);
await mkdir(output, { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(new URL(`node_modules/pdfjs-dist/${name}/`, root), new URL(`${name}/`, output), { recursive: true });
}
await cp(new URL('node_modules/pdfjs-dist/LICENSE', root), new URL('LICENSE', output));
console.log(`PDF rendering assets prepared: ${fileURLToPath(output)}`);
