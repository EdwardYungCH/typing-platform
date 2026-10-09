#!/usr/bin/env python3
"""把 tools/src/shape-chart.jpg（老師提供的字根與輔助字形表）切成每個字形一張透明 PNG，
存到 assets/shapes/<鍵>-<序號>.png；網頁用 CSS mask 上色，所以深色淺色主題都清楚。
分割方法：每列找出有墨水的範圍，再按字與字之間的空隙切開。"""
from PIL import Image
import json, os
SRC = 'tools/src/shape-chart.jpg'
OUT = 'assets/shapes'
im = Image.open(SRC).convert('L')
W, H = im.size
ink = lambda x, y: im.getpixel((x, y)) < 120

def bands(x0, x1, y0, y1, gap, axis):
    pts = ([y for y in range(y0, y1) if any(ink(x, y) for x in range(x0, x1))] if axis == 'y'
           else [x for x in range(x0, x1) if any(ink(x, y) for y in range(y0, y1 + 1))])
    out, s, p = [], None, None
    for v in pts:
        if s is None: s = v
        elif v - p > gap: out.append((s, p)); s = v
        p = v
    if s is not None: out.append((s, p))
    return out

os.makedirs(OUT, exist_ok=True)
counts = {}
for keys, (x0, x1) in (('abcdefghijklmn', (152, 472)), ('opqrstuvwyXX', (632, 952))):
    xi = 0
    for k, (y0, y1) in zip(keys, bands(x0, x1, 0, H, 4, 'y')):
        key = 'x' if k == 'X' else k
        for (a, b) in bands(x0, x1, y0 - 6, y1 + 6, 12, 'x'):
            # 每個字形放進正方形，留少許邊
            top, bot = y0 - 6, y1 + 6
            ys = [y for y in range(top, bot + 1) if any(ink(x, y) for x in range(a, b + 1))]
            t, bt = ys[0], ys[-1]
            side = max(b - a, bt - t) + 8
            cx, cy = (a + b) / 2, (t + bt) / 2
            box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
            # 只保留這一列、這個字的範圍（以免把格線或旁邊的字也切進來）
            cell = im.crop(box).copy()
            px = cell.load()
            for yy in range(cell.size[1]):
                for xx in range(cell.size[0]):
                    gx, gy = box[0] + xx, box[1] + yy
                    if not (top <= gy <= bot and a - 1 <= gx <= b + 1):
                        px[xx, yy] = 255
            crop = cell.resize((96, 96), Image.LANCZOS)
            # 深色筆畫 → 不透明；淺色底 → 透明
            # 以這一格的底色為準：比底色深得多才算筆畫（不同分類的底色深淺不同）
            inside = list(im.crop((a, top, b + 1, bot + 1)).get_flattened_data())
            bg = sorted(inside)[int(len(inside) * 0.7)]  # 這一格最常見的淺色就是底色
            lo = 90
            hi = bg - 25
            alpha = crop.point(lambda v: 255 if v <= lo else (0 if v >= hi else int((hi - v) * 255 / (hi - lo))))
            out = Image.new('LA', crop.size, 0)
            out.putalpha(alpha)
            n = counts.get(key, 0)
            out.save(f'{OUT}/{key}-{n}.png', optimize=True)
            counts[key] = n + 1
print(counts, sum(v for k, v in counts.items() if k != 'x'))
json.dump(counts, open(f'{OUT}/counts.json', 'w'))
