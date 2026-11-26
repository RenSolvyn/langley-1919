// Refuses to ship a build that lost something: the night lamp layer, either network, a core file, an unfilled build
// placeholder, or a file over GitHub's 100 MB limit. Runs before every push and again in the deploy workflow.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [];
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [name, mark] of [['night lamp layer', '"nf":"lmn/'], ['reflection network', 'const RRW={'], ['upscaler network', 'const TSRW={']]) {
  if (!html.includes(mark)) bad.push('index.html is missing the ' + name);
}
if (/__[A-Z0-9]+__/.test(html)) bad.push('index.html has an unfilled build placeholder');
for (const f of ['lib/three.min.js', 'lm/INT1.jpg', 'lmn/INT1.jpg', 'lmn_m/INT1.jpg', 'world', 'world/walls.bin', 'snd/music', 'manifest.webmanifest', 'README.md', 'LICENSE']) {
  if (!fs.existsSync(path.join(root, f))) bad.push('missing ' + f);
}
let files = 0, bytes = 0;
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (['.git', 'node_modules', '.private', '_site'].includes(e.name)) continue;
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else { const s = fs.statSync(p).size; files++; bytes += s; if (s > 95e6) bad.push('file over 95 MB: ' + path.relative(root, p)); }
} };
walk(root);
// private material and assistant attribution never ship: checked by name and by content, not left to .gitignore
const gi = fs.existsSync(path.join(root, '.gitignore')) ? fs.readFileSync(path.join(root, '.gitignore'), 'utf8') : '';
if (!/^\.private\/?$/m.test(gi)) bad.push('.gitignore must list .private/');
const textRe = /\.(html|md|js|mjs|json|txt|css|webmanifest)$/i;
const scan = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (['.git', 'node_modules', '.private', '_site'].includes(e.name)) continue;
  const p = path.join(d, e.name), rel = path.relative(root, p);
  if (/(^|\/)(sim-errlog|errlog|\.claude)(\/|$)|errors\.jsonl$|(^|\/)CLAUDE\.md$/i.test(rel)) bad.push('private file in the site: ' + rel);
  if (e.isDirectory()) scan(p);
  else if (textRe.test(e.name) && rel !== path.join('scripts', 'check.mjs') && rel !== path.join('scripts', 'push.mjs')) {
    const t = fs.readFileSync(p, 'utf8');
    if (/co-authored-by:\s*claude|claude-session:|claude\.ai\/code|noreply@anthropic\.com/i.test(t)) bad.push('assistant attribution in ' + rel);
  }
} };
scan(root);
if (bad.length) { console.error('Build check failed:\n- ' + bad.join('\n- ')); process.exit(1); }
console.log('Build check passed: ' + files + ' files, ' + (bytes / 1e6).toFixed(1) + ' MB, lamp layer, both networks, collision and music present, nothing private.');
