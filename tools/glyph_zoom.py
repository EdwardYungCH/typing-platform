#!/usr/bin/env python3
"""把指定的字放大畫成紅藍圖並截圖：python3 tools/glyph_zoom.py 字字字 out.png [尺寸]"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from glyph_svg import load, svg
chars, out = sys.argv[1], sys.argv[2]; size = int(sys.argv[3]) if len(sys.argv) > 3 else 150
cells = ''.join(f'<span>{svg(load(c), size, f"z{ord(c)}") if os.path.exists(f"assets/glyphs/{ord(c):x}.json") else c}<b>{c}</b></span>' for c in chars)
html = out[:-4] + '.html'
open(html, 'w', encoding='utf-8').write('<meta charset=utf8><style>body{display:flex;flex-wrap:wrap;gap:4px;margin:4px;font:14px sans-serif;width:1090px;background:#fff}span{display:flex;flex-direction:column;align-items:center;border:1px solid #ddd}</style>' + cells)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); pg = b.new_page(viewport={'width': 1100, 'height': 300})
    pg.goto('file://' + os.path.abspath(html)); pg.screenshot(path=out, full_page=True)
