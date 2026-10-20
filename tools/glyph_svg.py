"""拆碼圖 → SVG（核對工具共用；跟 js/zh-glyph.js 的畫法一致，支援切筆 c）。"""
import json
COL = {'f': '#e00000', 'l': '#0040ff', '.': '#cfcfcf'}

def load(ch):
    return json.load(open(f'assets/glyphs/{ord(ch):x}.json', encoding='utf-8'))

def svg(g, size=108, uid='g'):
    r = g.get('r') or '.' * len(g['s']); cuts = g.get('c', {}); defs = ''; p = ''
    for i, (d, x) in enumerate(zip(g['s'], r)):
        if x != 's':
            p += f'<path d="{d}" fill="{COL[x]}"/>'; continue
        c = cuts[str(i)]
        ax, cut = c[0], c[1]
        bounds, segs = (cut, c[2]) if isinstance(cut, list) else ([cut], c[2:4])
        edges = [-400] + bounds + [1400]
        for k, role in enumerate(segs):
            a, b = edges[k], edges[k + 1]
            rect = f'<rect x="{a}" y="-400" width="{b - a}" height="1800"/>' if ax == 'x' else f'<rect x="-400" y="{a}" width="1800" height="{b - a}"/>'
            cid = f'{uid}_{i}_{k}'
            defs += f'<clipPath id="{cid}">{rect}</clipPath>'
            p += f'<path d="{d}" fill="{COL[role]}" clip-path="url(#{cid})"/>'
    return f'<svg viewBox="0 30 1024 1024" width={size} height={size}><g transform="scale(1,-1) translate(0,-900)"><defs>{defs}</defs>{p}</g></svg>'
