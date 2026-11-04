"""自動打完全部英文課的每一步（包括過關小測），檢查每步都能完成、沒有 JS 錯誤。
用法：python3 -m http.server 8765（另一個視窗）；python3 tools/test/play_all_en.py"""
import json
from playwright.sync_api import sync_playwright
B = 'http://localhost:8765/'
L = json.load(open('data/en-lessons.json'))['lessons']
def h(route):
    r = route.fetch(); t = r.text() + "\nwindow.__t={state};"
    route.fulfill(response=r, body=t, headers={**r.headers, 'content-type': 'text/javascript'})
problems = 0
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width': 1366, 'height': 768}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/js/type-page.js', h)
    for l in L:
        for si, st in enumerate(l['steps']):
            if st['type'] == 'guide': continue
            pg.goto(B + f"type.html?lang=en&mode=lesson&id={l['id']}&step={si+1}"); pg.wait_for_timeout(400)
            n = 0
            while n < 1500:
                k = pg.evaluate("()=>{const e=__t.state.engine; if(!e||e.finished) return null; return e.text[e.pos] ?? null}")
                if k is None: break
                if k == ' ': pg.keyboard.press('Space')
                else: pg.keyboard.type(k)
                n += 1
            fin = pg.evaluate("()=>!__t.state.engine||__t.state.engine.finished")
            panel = pg.evaluate("()=>!document.getElementById('overlay').hidden && document.getElementById('panel-title').textContent")
            if not fin or (st['type'] == 'test' and panel not in ('過關！', '完成這一課！')):
                problems += 1; print('PROBLEM', l['id'], st['title'], fin, panel, n)
    print('done; problems', problems, 'errors', errs[:3]); b.close()
