// One command from a fresh unzip to a live site, using the token you already export:
//   export GITHUB_TOKEN=ghp_...        (classic token with the repo scope)
//   npm ci && npm run push
// Steps: token, build check, private error log, repository (created if missing), commit on top of the repository's
// history and push, GitHub Pages from the branch root, wait for the Pages build, print the live address.
// The token reaches git through this process's environment only; it is never written to disk or to git config.
// Safe to run again: it reuses the repository, keeps its history, and only commits what changed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const REPO = process.env.REPO || pkg.config.repo;
const API = process.env.API_BASE || 'https://api.github.com';
const TOKEN = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
const MSG = process.env.MSG || 'Release v' + pkg.version + ': game update';
// commit messages and file names that must never reach this public repository
const TRAILER_RE = /^\s*(co-authored-by:.*(claude|anthropic)|claude-session:|generated with \[?claude)/i;
const PRIVATE_RE = /(^|\/)(\.private|sim-errlog|errlog|\.claude)(\/|$)|errors\.jsonl$|(^|\/)CLAUDE\.md$/i;
const TOKENS_URL = 'https://github.com/settings/tokens';

const die = m => { console.error('\nSTOPPED: ' + m); process.exit(1); };
const step = m => console.log('\n== ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(method, p, body) {
  let r = null;
  // a long push can leave an idle keep-alive connection closed by the server; retry network errors a few times
  for (let k = 0; k < 4 && !r; k++) {
    try {
      r = await fetch(API + p, { method, body: body ? JSON.stringify(body) : undefined, headers: {
        Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + TOKEN, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'langley-1919-push', Connection: 'close' } });
    } catch (e) { if (k === 3) die('could not reach GitHub: ' + (e.cause && e.cause.code || e.message) + '. Check the connection and run npm run push again'); await sleep(1500 * (k + 1)); }
  }
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
  return { status: r.status, json: j, headers: r.headers, msg: (j && j.message) || t.slice(0, 200) };
}
const GENV = Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + TOKEN).toString('base64') });
function git(args, { ok = false, capture = false } = {}) {
  const r = spawnSync('git', args, { env: GENV, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') die('git is not installed. On Pop!_OS: sudo apt install git');
  if (!ok && r.status !== 0) { if (capture) process.stderr.write((r.stdout || '') + (r.stderr || '')); die('git ' + args[0] + ' failed'); }
  return r;
}
const gout = args => { const r = git(args, { ok: true, capture: true }); return r.status === 0 ? r.stdout.trim() : null; };

step('1/8 GitHub token');
if (!TOKEN) die('no token found. Run: export GITHUB_TOKEN=ghp_...  (a classic token with the repo scope from ' + TOKENS_URL + '), then npm run push again');
const me = await api('GET', '/user');
if (me.status === 401) die('GitHub rejected the token in GITHUB_TOKEN (expired or revoked). Make a new classic token with the repo scope at ' + TOKENS_URL + ', export it, and run npm run push again');
if (me.status !== 200) die('GitHub answered HTTP ' + me.status + ': ' + me.msg);
const owner = me.json.login;
const scopes = (me.headers.get('x-oauth-scopes') || '').split(',').map(s => s.trim()).filter(Boolean);
if (scopes.length && !scopes.includes('repo') && !scopes.includes('public_repo')) die('the token works but lacks the repo scope (it has: ' + scopes.join(', ') + '). Edit it at ' + TOKENS_URL + ' and tick repo');
const full = owner + '/' + REPO;
console.log('token OK for ' + owner + (scopes.length ? ' (scopes: ' + scopes.join(', ') + ')' : ' (fine-grained token)'));

step('2/8 Build check');
{ const r = spawnSync(process.execPath, ['scripts/check.mjs'], { stdio: 'inherit' }); if (r.status !== 0) die('the build check failed; nothing was pushed'); }

step('3/8 Private error log (kept outside the repository)');
{
  const src = path.join(root, '.private', 'sim-errlog'), dst = path.join(os.homedir(), 'sim-errlog');
  if (fs.existsSync(src)) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of ['errlog.py', 'README.md']) fs.copyFileSync(path.join(src, f), path.join(dst, f));
    const dj = path.join(dst, 'errors.jsonl');
    const have = new Set(fs.existsSync(dj) ? fs.readFileSync(dj, 'utf8').split('\n').filter(Boolean) : []);
    const add = fs.readFileSync(path.join(src, 'errors.jsonl'), 'utf8').split('\n').filter(l => l && !have.has(l));
    if (add.length) fs.appendFileSync(dj, add.join('\n') + '\n');
    console.log(dst + ': ' + add.length + ' new events appended, ' + have.size + ' kept (append-only)');
  } else console.log('no error log in this package');
}

step('4/8 Repository ' + full);
let repo = await api('GET', '/repos/' + full);
if (repo.status === 404) {
  repo = await api('POST', '/user/repos', { name: REPO, description: pkg.description, homepage: 'https://' + owner.toLowerCase() + '.github.io/' + REPO + '/', private: false });
  if (repo.status !== 201) die('could not create ' + full + ' (HTTP ' + repo.status + ': ' + repo.msg + ')');
  console.log('created ' + full);
} else if (repo.status === 200) console.log('found ' + full);
else die('could not read ' + full + ' (HTTP ' + repo.status + ': ' + repo.msg + ')');
const branch = (repo.json && repo.json.default_branch) || 'main';

step('5/8 History: remove assistant trailers from earlier commits');
const url = process.env.REMOTE_URL || 'https://github.com/' + full + '.git';
if (!fs.existsSync('.git')) git(['init', '-q', '-b', branch]);
if (gout(['remote', 'get-url', 'origin']) === null) git(['remote', 'add', 'origin', url]); else git(['remote', 'set-url', 'origin', url]);
if (git(['fetch', '-q', 'origin', branch], { ok: true, capture: true }).status === 0) {
  // build on the repository's history: the branch points at the remote tip, this folder's files become the new state
  git(['symbolic-ref', 'HEAD', 'refs/heads/' + branch]);
  git(['update-ref', 'refs/heads/' + branch, 'refs/remotes/origin/' + branch]);
  git(['reset', '-q']);
}
const base = gout(['rev-parse', '--verify', '-q', 'refs/remotes/origin/' + branch]);
let rewrote = false;
if (base) {
  const msgs = gout(['log', '--format=%B%x00', 'refs/heads/' + branch]) || '';
  if (msgs.split('\n').some(l => TRAILER_RE.test(l))) {
    // rebuild each commit with the same tree, parents, authors and dates and a cleaned message (plumbing only, so the
    // working folder is untouched), then push with a lease on the tip that was fetched
    const revs = (gout(['rev-list', '--reverse', '--topo-order', 'refs/heads/' + branch]) || '').split('\n').filter(Boolean);
    const map = new Map(); let tip = null;
    for (const c of revs) {
      const raw = spawnSync('git', ['cat-file', 'commit', c], { env: GENV, encoding: 'utf8' }).stdout || '';
      const cut = raw.indexOf('\n\n'), head = raw.slice(0, cut), msg = raw.slice(cut + 2);
      const tree = /^tree (\w+)/m.exec(head)[1], parents = [...head.matchAll(/^parent (\w+)/mg)].map(m => map.get(m[1]) || m[1]);
      const au = /^author (.*) <(.*)> (\d+ [+-]\d{4})$/m.exec(head), cm = /^committer (.*) <(.*)> (\d+ [+-]\d{4})$/m.exec(head);
      const clean = msg.split('\n').filter(l => !TRAILER_RE.test(l)).join('\n').replace(/\s+$/, '') + '\n';
      const env = Object.assign({}, GENV, { GIT_AUTHOR_NAME: au[1], GIT_AUTHOR_EMAIL: au[2], GIT_AUTHOR_DATE: au[3], GIT_COMMITTER_NAME: cm[1], GIT_COMMITTER_EMAIL: cm[2], GIT_COMMITTER_DATE: cm[3] });
      const args = ['commit-tree', tree]; for (const q of parents) args.push('-p', q);
      const r = spawnSync('git', args, { env, input: clean, encoding: 'utf8' });
      if (r.status !== 0) { process.stderr.write(r.stderr || ''); die('could not rewrite commit ' + c.slice(0, 7)); }
      tip = r.stdout.trim(); map.set(c, tip);
    }
    git(['update-ref', 'refs/heads/' + branch, tip]); git(['reset', '-q']);
    rewrote = true; console.log('removed assistant trailers from ' + revs.length + ' commit messages on ' + branch);
  } else console.log('history is clean');
} else console.log('new repository, no history yet');

step('6/8 Commit and push to ' + branch);
if (!gout(['config', 'user.email'])) {
  git(['config', 'user.name', me.json.name || owner]);
  git(['config', 'user.email', me.json.id + '+' + owner + '@users.noreply.github.com']);
}
git(['add', '-A']);
{ const staged = (gout(['diff', '--cached', '--name-only']) || '').split('\n').filter(Boolean).filter(f => PRIVATE_RE.test(f));
  if (staged.length) die('private files were about to be committed: ' + staged.slice(0, 5).join(', ') + '. They must stay out of this public repository'); }
const changed = git(['diff', '--cached', '--quiet'], { ok: true, capture: true }).status !== 0;
if (changed) git(['commit', '-q', '-m', MSG]); else console.log('no changes since the last push');
{
  const args = ['push', '-u', 'origin', 'HEAD:refs/heads/' + branch];
  if (rewrote) args.splice(1, 0, '--force-with-lease=' + branch + ':' + base);
  const p = git(args, { ok: true, capture: true });
  process.stdout.write((p.stdout || '') + (p.stderr || ''));
  if (p.status !== 0) {
    if (/workflow/i.test(p.stderr || '')) die('GitHub refused a change under .github/workflows; add the workflow scope to the token at ' + TOKENS_URL);
    if (/denied|403|401|Authentication/i.test(p.stderr || '')) die('GitHub refused the push with this token; check that it has the repo scope and access to ' + full);
    die('git push failed (see above)');
  }
}
const sha = gout(['rev-parse', 'HEAD']);

step('7/8 GitHub Pages (from ' + branch + ', root folder)');
const want = { build_type: 'legacy', source: { branch, path: '/' } };
let pages = await api('GET', '/repos/' + full + '/pages');
if (pages.status === 404) {
  const c = await api('POST', '/repos/' + full + '/pages', want);
  if (c.status !== 201) die('could not turn on Pages (HTTP ' + c.status + ': ' + c.msg + '). Open https://github.com/' + full + '/settings/pages and choose Deploy from a branch, ' + branch + ', / (root)');
  console.log('Pages turned on');
} else if (pages.status === 200) {
  const s = pages.json.source || {};
  if (pages.json.build_type !== 'legacy' || s.branch !== branch || s.path !== '/') {
    const u = await api('PUT', '/repos/' + full + '/pages', want);
    if (u.status !== 204) die('could not set Pages to ' + branch + ' / (HTTP ' + u.status + ': ' + u.msg + ')');
    console.log('Pages set to deploy from ' + branch + ' /');
  } else console.log('Pages already deploys from ' + branch + ' /');
} else die('could not read the Pages settings (HTTP ' + pages.status + ': ' + pages.msg + ')');

step('8/8 Waiting for the Pages build of ' + sha.slice(0, 7));
let done = false;
for (let i = 0; i < 72 && !done; i++) {
  const b = await api('GET', '/repos/' + full + '/pages/builds/latest');
  if (b.status === 200 && b.json.commit === sha) {
    if (b.json.status === 'built') done = true;
    else if (b.json.status === 'errored') die('the Pages build failed: ' + ((b.json.error && b.json.error.message) || 'no message') + '. See https://github.com/' + full + '/deployments');
  }
  if (!done) { if (i === 6) await api('POST', '/repos/' + full + '/pages/builds'); process.stdout.write('.'); await sleep(5000); }
}
pages = await api('GET', '/repos/' + full + '/pages');
const live = (pages.json && pages.json.html_url) || ('https://' + owner.toLowerCase() + '.github.io/' + REPO + '/');
if (!done) console.log('\nThe build is still running after 6 minutes; the site updates by itself when it finishes. Progress: https://github.com/' + full + '/deployments');
console.log('\nLIVE: ' + live + '\nRepository: https://github.com/' + full);
