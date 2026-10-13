from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); errs=[]
    pg=b.new_page(viewport={'width':1100,'height':800}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    r=pg.evaluate("""async()=>{
      const {loadFingers,keyForChar}=await import('./js/keyboard.js'); const {generateText,makeRng}=await import('./js/engine.js');
      await loadFingers(); const d=await (await fetch('data/en-lessons.json')).json(); const out=[];
      for(const l of d.lessons){ for(const s of l.steps){ if(s.type==='guide')continue; const t=s.text??generateText(s.gen,makeRng());
        const bad=[...new Set([...t.replace(/\\u00a0/g,' ')].filter(c=>!keyForChar(c)))]; if(bad.length||!t.length) out.push([l.id,s.title,bad,t.length]);
        if(s.type==='test'&&(!s.pass||!s.pass.accuracy)) out.push([l.id,'no pass']); } }
      return out;}""")
    print('problems:',r, errs); 
    for lid,step in [(2,5),(11,4),(13,2),(15,5),(16,3)]:
        pg.goto(f'http://localhost:8765/type.html?lang=en&mode=lesson&id={lid}&step={step}'); pg.wait_for_timeout(600)
        print(lid, pg.evaluate("document.getElementById('lesson-title').textContent"), '|', pg.evaluate("document.getElementById('text').textContent.slice(0,70)"))
    b.close()
