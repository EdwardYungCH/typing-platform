#!/usr/bin/env python3
"""把全部已上色的字畫成紅藍核對表（每張 81 字，常用字先），每格下面標速成首尾碼。
用法：python3 tools/glyph_sheets.py 輸出資料夾 → s00.html、s01.html…，再用 Playwright 截圖逐張看。"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glyph_svg import svg
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
        g=json.load(open(f'assets/glyphs/{ord(c):x}.json'))
        q=first.get(c,'')
        lab=''.join(ROOTS[k] for k in q)
        cells+=f'<span>{svg(g, 108, "s"+str(ord(c)))}<b>{c} <i style="color:#e00000">{ROOTS[q[0]] if q else ""}</i><i style="color:#0040ff">{ROOTS[q[1]] if len(q)>1 else ""}</i></b></span>'
    open(f'{sys.argv[1]}/s{si//N:02d}.html','w').write('<meta charset=utf8><style>body{display:grid;grid-template-columns:repeat(9,120px);gap:2px;margin:2px;font:15px sans-serif;width:1090px;background:#fff}span{display:flex;flex-direction:column;align-items:center;border:1px solid #e4e4e4}i{font-style:normal;font-weight:700}</style>'+cells)
print(len(order), (len(order)+N-1)//N)
