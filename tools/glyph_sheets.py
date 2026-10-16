#!/usr/bin/env python3
"""把全部已上色的字畫成紅藍核對表（每張 81 字，常用字先），每格下面標速成首尾碼。
用法：python3 tools/glyph_sheets.py 輸出資料夾 → s00.html、s01.html…，再用 Playwright 截圖逐張看。"""
import json, os, sys
Z=json.load(open('data/zh-codes.json')); ROOTS=dict(zip('abcdefghijklmnopqrstuvwyx','日月金木水火土竹戈十大中一弓人心手口尸廿山女田卜難'))
first={}
for code in sorted(Z['quick']):
    for ch in Z['quick'][code]: first.setdefault(ch, code)
first.update(Z['qfix'])
order=[c for c in Z['common'] if os.path.exists(f'assets/glyphs/{ord(c):x}.json') and 'r' in json.load(open(f'assets/glyphs/{ord(c):x}.json'))]
extra=[chr(int(f[:-5],16)) for f in os.listdir('assets/glyphs') if f.endswith('.json') and 'r' in json.load(open('assets/glyphs/'+f))]
order+= [c for c in extra if c not in set(order)]
json.dump(order, open(sys.argv[1]+'/order.json','w'), ensure_ascii=False)
col={'f':'#e00000','l':'#0040ff','.':'#cfcfcf'}
N=81
for si in range(0, len(order), N):
    cells=''
    for c in order[si:si+N]:
        g=json.load(open(f'assets/glyphs/{ord(c):x}.json')); r=g['r']; cut=g.get('c',{}); defs=''; p=''
        for i,(d,x) in enumerate(zip(g['s'],r)):
            if x=='s':
                ax,v,lo,hi=cut[str(i)]
                ra=f'<rect x="-400" y="-400" width="{v+400}" height="1800"/>' if ax=='x' else f'<rect x="-400" y="-400" width="1800" height="{v+400}"/>'
                rb=f'<rect x="{v}" y="-400" width="1800" height="1800"/>' if ax=='x' else f'<rect x="-400" y="{v}" width="1800" height="1800"/>'
                defs+=f'<clipPath id="a{ord(c)}_{i}">{ra}</clipPath><clipPath id="b{ord(c)}_{i}">{rb}</clipPath>'
                p+=f'<path d="{d}" fill="{col[lo]}" clip-path="url(#a{ord(c)}_{i})"/><path d="{d}" fill="{col[hi]}" clip-path="url(#b{ord(c)}_{i})"/>'
            else: p+=f'<path d="{d}" fill="{col[x]}"/>'
        q=first.get(c,'')
        lab=''.join(ROOTS[k] for k in q)
        cells+=f'<span><svg viewBox="0 30 1024 1024" width=108 height=108><g transform="scale(1,-1) translate(0,-900)"><defs>{defs}</defs>{p}</g></svg><b>{c} <i style="color:#e00000">{ROOTS[q[0]] if q else ""}</i><i style="color:#0040ff">{ROOTS[q[1]] if len(q)>1 else ""}</i></b></span>'
    open(f'{sys.argv[1]}/s{si//N:02d}.html','w').write('<meta charset=utf8><style>body{display:grid;grid-template-columns:repeat(9,120px);gap:2px;margin:2px;font:15px sans-serif;width:1090px;background:#fff}span{display:flex;flex-direction:column;align-items:center;border:1px solid #e4e4e4}i{font-style:normal;font-weight:700}</style>'+cells)
print(len(order), (len(order)+N-1)//N)
