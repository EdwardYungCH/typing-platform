import json
from playwright.sync_api import sync_playwright
B='http://localhost:8765/'
L=json.load(open('data/zh-lessons.json'))['lessons']
def h(route):
    r=route.fetch(); t=r.text()+"\nwindow.__t={state};"
    route.fulfill(response=r,body=t,headers={**r.headers,'content-type':'text/javascript'})
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); errs=[]
    pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/js/type-page.js',h)
    for l in L:
        for si,st in enumerate(l['steps']):
            if st['type']=='guide': continue
            pg.goto(B+f"type.html?lang=zh&mode=lesson&id={l['id']}&step={si+1}"); pg.wait_for_timeout(500)
            n=0; limit=60 if st['type']=='test' else 400; stuck=None
            while n<limit:
                info=pg.evaluate("()=>{const e=__t.state.engine; if(!e||e.finished) return null; return {k: e.nextKey? e.nextKey(): e.text[e.pos], pos:e.pos}}")
                if info is None: break
                k=info['k']
                if k is None: stuck=('none',info); break
                if k==' ': pg.keyboard.press('Space')
                elif len(k)>1: pg.keyboard.press(k)
                else: pg.keyboard.type(k)
                n+=1
            fin=pg.evaluate("()=>!__t.state.engine||__t.state.engine.finished")
            pos=pg.evaluate("()=>__t.state.engine?__t.state.engine.pos:-1")
            ok = stuck is None and (fin or st['type']=='test')
            if not ok or st['type']!='test' and not fin: print('PROBLEM',l['id'],st['title'],stuck,fin,pos,n)
    print('done', errs[:3]); b.close()
