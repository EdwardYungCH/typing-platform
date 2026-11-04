// 用 Node 內置 SQLite 模擬 Cloudflare D1（prepare().bind().first()/all()/run()、batch()），本機伺服器和自動測試共用。
import { DatabaseSync } from 'node:sqlite';

export function makeD1(file = ':memory:') {
  const sqlite = new DatabaseSync(file);
  const Q = { n: 0 };
  const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  class Stmt {
    constructor(sql) { this.sql = sql; this.args = []; }
    bind(...args) { this.args = args.map(fix); return this; }
    async first() { Q.n++; return sqlite.prepare(this.sql).get(...this.args) ?? null; }
    async all() { Q.n++; return { results: sqlite.prepare(this.sql).all(...this.args) }; }
    async run() { Q.n++; return this._run(); }
    _run() {
      const st = sqlite.prepare(this.sql);
      // PRAGMA 和 SELECT 用 all()，其他用 run()
      if (/^\s*(PRAGMA|SELECT)/i.test(this.sql) && !/=/.test(this.sql.split('PRAGMA')[1] ?? '=')) return { results: st.all(...this.args), meta: { changes: 0 } };
      const r = st.run(...this.args);
      return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } };
    }
  }
  // batch 跟 D1 一樣是一個交易：中途出錯就全部還原
  const DB = {
    prepare: (sql) => new Stmt(sql),
    exec: async (sql) => sqlite.exec(sql),
    batch: async (stmts) => {
      Q.n++;
      sqlite.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(s._run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  return { DB, Q, sqlite };
}
