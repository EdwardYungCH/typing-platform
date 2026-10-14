// 本機模擬伺服器：用 Node 內置 SQLite 模擬 Cloudflare D1，並出靜態檔，讓 worker/index.js 可以在本機測試。
// 用法：node --experimental-sqlite tools/dev-server.mjs [port] [dbfile]
//   預設 port 8787，資料庫存在記憶體（加 dbfile 參數就存到檔案）。
// 正式環境不會用到這個檔案；Cloudflare 上由 wrangler 直接跑 worker/index.js。

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.argv[2] ?? 8787);
const DBFILE = process.argv[3] ?? ':memory:';
const ROOT = new URL('..', import.meta.url).pathname;

// ---- D1 模擬：prepare().bind().first()/all()/run()，batch() ----
const sqlite = new DatabaseSync(DBFILE);
for (const f of readdirSync(join(ROOT, 'migrations')).sort()) sqlite.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));

const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args.map(fix); return this; }
  async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() { const r = sqlite.prepare(this.sql).run(...this.args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }
}
const DB = { prepare: (sql) => new Stmt(sql), batch: async (stmts) => Promise.all(stmts.map((s) => s.run())), exec: async (sql) => sqlite.exec(sql) };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.csv': 'text/csv' };

const ASSETS = {
  async fetch(req) {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    try {
      if ((await stat(file)).isDirectory()) return Response.redirect(url.origin + p + '/', 302);
      return new Response(await readFile(file), { headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' } });
    } catch { return new Response('Not found', { status: 404 }); }
  },
};

// worker 會 import migrations/*.sql 當文字（Cloudflare 由 wrangler.jsonc 的 rules 處理）；Node 用這個小 loader 模擬
const { register } = await import('node:module');
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, next) {
    if (url.endsWith('.sql')) { const { readFile } = await import('node:fs/promises'); const t = await readFile(new URL(url), 'utf8'); return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(t) }; }
    return next(url, context);
  }`));
const worker = (await import('../worker/index.js')).default;
const env = { DB, ASSETS };

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const bodyBuf = Buffer.concat(chunks);
  const url = `http://localhost:${PORT}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const r = await worker.fetch(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuf }), env);
  res.statusCode = r.status;
  r.headers.forEach((v, k) => {
    // 本機沒有 https：去掉 Secure，cookie 才會生效
    if (k === 'set-cookie') v = v.replace('; Secure', '');
    res.setHeader(k, v);
  });
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`本機伺服器 http://localhost:${PORT}（資料庫：${DBFILE}）`));
