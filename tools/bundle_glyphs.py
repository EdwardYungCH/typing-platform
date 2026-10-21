#!/usr/bin/env python3
"""把每課用到的拆碼圖合併成一個檔，減少每步要抓幾十個小檔的請求。
輸出：assets/glyph-bundles/zh-<課號>.json  {"字": 字形資料, ...}
      assets/glyph-bundles/shapes.json  字形表例字（有 shapeKey 投影片的課會一併載入）
個別 assets/glyphs/<hex>.json 保留，查字頁和自訂練習仍然逐字抓。
用法：python3 tools/bundle_glyphs.py（改過 build_zh_glyphs.py 或課程後再跑一次）
"""
import json, os, re
HAN = re.compile(r'[一-鿿]')
def glyph(ch):
    p = f'assets/glyphs/{ord(ch):x}.json'
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None
os.makedirs('assets/glyph-bundles', exist_ok=True)
lessons = json.load(open('data/zh-lessons.json', encoding='utf-8'))['lessons']
total = 0
for l in lessons:
    chars = sorted(set(HAN.findall(json.dumps(l, ensure_ascii=False))))
    out = {c: g for c in chars if (g := glyph(c))}
    s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    open(f'assets/glyph-bundles/zh-{l["id"]}.json', 'w', encoding='utf-8').write(s)
    total += len(s); print(f'第 {l["id"]} 課：{len(out)} 字，{len(s)//1024} KB')
sh = json.load(open('data/zh-shapes.json', encoding='utf-8'))
ex = set()
for info in (sh.get('chartInfo', {}), sh.get('rootInfo', {})):
    for v in info.values():
        for e in v.get('examples', []):
            if e[2:3] and e[2]: ex.add(e[0])
out = {c: g for c in sorted(ex) if (g := glyph(c))}
s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
open('assets/glyph-bundles/shapes.json', 'w', encoding='utf-8').write(s)
print(f'字形表例字：{len(out)} 字，{len(s)//1024} KB；合計 {total//1024} KB')
