#!/usr/bin/env python3
"""把字逐筆編號畫出來（每筆不同顏色，中線中點印筆序號），用來定 PARTIAL／切筆。
用法：python3 tools/render_strokes.py 字字字 out.html，再用 Playwright 截圖。Make Me a Hanzi 路徑固定 /home/claude/src/makemeahanzi。"""
import json, sys
chars=sys.argv[1]; out=sys.argv[2]
G={}
for l in open('/home/claude/src/makemeahanzi/graphics.txt',encoding='utf-8'):
    o=json.loads(l)
    if o['character'] in chars: G[o['character']]=o
cj=json.load(open('data/zh-codes.json'))['cj']
cols=['#e6194b','#3cb44b','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6','#9a6324','#808000','#000075','#e6beff','#aaffc3','#ffd8b1','#469990','#fabed4','#dcbeff']
cells=[]
for c in chars:
    o=G.get(c)
    if not o: cells.append(f'<div class=c><b>{c} 無資料</b></div>'); continue
    p=''.join(f'<path d="{s}" fill="{cols[i%16]}"/>' for i,s in enumerate(o['strokes']))
    t=''
    for i,m in enumerate(o['medians']):
        x,y=m[len(m)//2]; t+=f'<text x="{x}" y="{900-y}" font-size="90" fill="#000" stroke="#fff" stroke-width="18" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">{i}</text>'
    cells.append(f'<div class=c><svg viewBox="0 0 1024 1024" width=170 height=170><g transform="scale(1,-1) translate(0,-900)">{p}</g>{t}</svg><b>{c} {cj.get(c,"")}</b></div>')
open(out,'w').write('<meta charset=utf8><style>body{display:flex;flex-wrap:wrap;gap:6px;font:20px sans-serif;margin:6px}.c{border:1px solid #ccc;text-align:center}</style>'+''.join(cells))
