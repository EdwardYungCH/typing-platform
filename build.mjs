// 建置腳本：把網站檔案複製到 dist/，並壓縮 JS 和 CSS。
// Cloudflare Pages 每次推送後會自動執行 `npm run build`，然後發佈 dist/。
// 平日修改的是原本易讀的檔案；學生在瀏覽器看到的是壓縮後的版本。

import { build } from 'esbuild';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const OUT = 'dist';

// 只有這些資料夾和檔案會上線；工具、資料庫腳本和設定檔不會發佈。
const SITE_DIRS = ['css', 'js', 'data', 'assets', 'en', 'zh', 'games', 'teacher', 'plus'];
const SITE_FILES = ['index.html', 'type.html', 'login.html', 'me.html', '_headers'];

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full));
    else out.push(full);
  }
  return out;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const file of SITE_FILES) {
  if (await exists(file)) await cp(file, join(OUT, file));
}

for (const dir of SITE_DIRS) {
  if (!(await exists(dir))) continue;
  for (const file of await listFiles(dir)) {
    const ext = extname(file);
    const target = join(OUT, file);
    if (ext === '.js' || ext === '.css') {
      await build({
        entryPoints: [file],
        outfile: target,
        bundle: false,
        minify: true,
        format: ext === '.js' ? 'esm' : undefined,
        target: ['es2020'],
        legalComments: 'none',
        logLevel: 'error',
      });
    } else {
      await mkdir(join(target, '..'), { recursive: true });
      await cp(file, target);
    }
  }
}

console.log('建置完成：dist/');
