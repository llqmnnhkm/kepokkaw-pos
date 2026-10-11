// Checks that every file the app needs is in the offline list in sw.js,
// so a new script, stylesheet or font can't be forgotten. No browser needed.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sw = read('sw.js');
const listed = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]));
const needed = new Set();

// scripts, stylesheets, icons and the manifest linked from index.html
const html = read('index.html');
for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) needed.add(m[1]);
// files loaded from the stylesheet (fonts)
for (const m of read('css/app.css').matchAll(/url\(([^)]+)\)/g)) needed.add(path.normalize(path.join('css', m[1].replace(/['"]/g, ''))));
// scripts the app loads on demand
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
  for (const m of read('js/' + f).matchAll(/loadScript\('([^']+)'\)/g)) needed.add(m[1]);
}
// icons from the manifest
for (const i of JSON.parse(read('manifest.webmanifest')).icons) needed.add(i.src);

let bad = 0;
for (const f of needed) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.log('FAIL missing file: ' + f); bad++; continue }
  if (!listed.has(f)) { console.log('FAIL not in the sw.js offline list: ' + f); bad++ }
}
for (const f of listed) if (f && !fs.existsSync(path.join(ROOT, f))) { console.log('FAIL sw.js lists a file that does not exist: ' + f); bad++ }
console.log(bad ? `\n${bad} FAILED` : `PASS all ${needed.size} app files are in the offline list`);
process.exit(bad ? 1 : 0);
