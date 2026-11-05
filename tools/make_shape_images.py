#!/usr/bin/env python3
"""由 Make Me a Hanzi 字形（Arphic Public License）抽出字根／輔助字形的部件，產生 assets/shapes/<鍵>-<n>.png。

舊版圖片是從一張來源不明的字形表切出來的，為了可以商業發佈，改為自行產生：
每個輔助字形取 data/zh-shapes.json chartInfo 的第一個有雙色拆碼資料的例字，
只畫首碼（f）或尾碼（l）那部分的筆畫，裁到部件邊界，輸出 96×96 的透明 PNG（灰階＋透明度，跟舊版格式一樣）。

用法：python3 tools/make_shape_images.py [輸出資料夾，預設 assets/shapes]
需要 Playwright（chromium）。會在 8796 埠暫時開一個本機網頁伺服器。
"""
import json, os, subprocess, sys, time, io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'shapes')
PORT = 8796
SIZE = 96
os.makedirs(OUT, exist_ok=True)

shapes = json.load(open(os.path.join(ROOT, 'data/zh-shapes.json'), encoding='utf-8'))
jobs = []   # (檔名, 字, 角色 f/l/all)
for key, info in shapes['chartInfo'].items():
    ex = [e for e in info['examples'] if len(e) > 2 and e[2]]
    if not ex:
        print('沒有例字，略過', key); continue
    ch, side = ex[0][0], ex[0][1]
    jobs.append((key, ch, side))
# 只有字根本體的鍵（例如 口）：畫整個字
for key in [k for k, n in shapes['chart'].items() if n >= 1 and k != 'x' and f'{k}-0' not in shapes['chartInfo']]:
    root = {'r': '口'}.get(key)
    if root: jobs.append((f'{key}-0', root, 'all'))

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        pg = b.new_page(viewport={'width': 600, 'height': 600}, device_scale_factor=1)
        pg.goto(f'http://localhost:{PORT}/tools/test/glyphs.html' if os.path.exists(os.path.join(ROOT, 'tools/test/glyphs.html')) else f'http://localhost:{PORT}/index.html')
        pg.set_content('<html><body style="margin:0;background:#fff"><div id="box" style="width:512px;height:512px"></div></body></html>')
        pg.add_script_tag(type='module', content=f"""
          import {{ glyphSvg }} from 'http://localhost:{PORT}/js/zh-glyph.js';
          window.draw = async (ch, side) => {{
            const g = await fetch('http://localhost:{PORT}/assets/glyphs/' + ch.codePointAt(0).toString(16) + '.json').then((r) => r.json());
            const box = document.getElementById('box');
            box.innerHTML = glyphSvg(g, side === 'all' ? 'plain' : side);
            const svg = box.querySelector('svg'); svg.style.width = '512px'; svg.style.height = '512px';
            // 只留要的部件（首碼 g-first／尾碼 g-last），其他刪走，全部塗黑
            const want = side === 'f' ? 'g-first' : side === 'l' ? 'g-last' : 'g-ink';
            for (const el of svg.querySelectorAll('path')) {{ if (!el.classList.contains(want)) el.remove(); else el.setAttribute('fill', '#000'); }}
            return svg.querySelectorAll('path').length;
          }};
          window.ready = true;""")
        pg.wait_for_function('window.ready === true')
        for name, ch, side in jobs:
            n = pg.evaluate('([c, s]) => window.draw(c, s)', [ch, side])
            if not n:
                print('沒有筆畫，略過', name, ch, side); continue
            png = pg.locator('#box').screenshot()
            im = Image.open(io.BytesIO(png)).convert('L')
            # 黑色部分 → 透明度；裁到邊界，留少許空位，置中放入正方形
            alpha = im.point(lambda v: 255 - v)
            bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
            if not bbox:
                print('空白，略過', name); continue
            alpha = alpha.crop(bbox)
            w, h = alpha.size
            # 細小的部件（一點、一撇）不要放大到填滿：最少以半個字的大小為框，保持跟其他字形相若的比例
            side_len = int(max(w, h, 230) * 1.12) + 4
            sq = Image.new('L', (side_len, side_len), 0)
            sq.paste(alpha, ((side_len - w) // 2, (side_len - h) // 2))
            sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
            out = Image.merge('LA', (Image.new('L', (SIZE, SIZE), 0), sq))
            out.save(os.path.join(OUT, f'{name}.png'))
            print('完成', name, ch, side)
        b.close()
finally:
    srv.terminate()
