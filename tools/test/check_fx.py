from playwright.sync_api import sync_playwright
S='tools/test/shots/'
B='http://localhost:8765/'
seed={"lessons":{"en:0":{"done":True,"stars":0,"bestWpm":0,"bestAccuracy":0}},"attempts":[],"settings":{"companion:planet":"rabbit"}}
import json
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1200,'height':800}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'index.html'); pg.evaluate("s=>localStorage.setItem('typing-platform:v1',JSON.stringify(s))",seed)
    pg.goto(B+'type.html?lang=en&mode=lesson&id=1&step=2'); pg.wait_for_timeout(700)
    txt=pg.evaluate("document.getElementById('text').textContent")
    print(repr(txt[:40]))
    for ch in txt.replace('\xa0',' ')[:26]:
        pg.keyboard.press('Space' if ch==' ' else ch); pg.wait_for_timeout(15)
    pg.wait_for_timeout(150)
    pg.screenshot(path=S+'combo.png')
    print('combo:',pg.evaluate("document.querySelector('.combo').textContent"), pg.evaluate("document.querySelectorAll('.spark').length"))
    pg.goto(B+'type.html?lang=en&mode=lesson&id=1&step=5'); pg.wait_for_timeout(700)
    print('focus:',pg.evaluate("document.body.classList.contains('focus-mode')"), pg.evaluate("document.getElementById('pet-top').hidden"))
    pg.screenshot(path=S+'focus.png')
    print(errs)
    b.close()
