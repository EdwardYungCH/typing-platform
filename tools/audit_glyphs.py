#!/usr/bin/env python3
"""拆碼圖自動核對（在 build_zh_glyphs 之後跑）。
1. 部件筆序：某部件的拆法（PARTIAL／切筆／沿用部件拆法）是按部件單獨成字時的筆序寫的；
   用在別的字裏，若該部件的筆畫次序不同（例如 力 的撇和橫折鈎次序），顏色就會標錯。
   方法：把部件單獨成字的筆畫中線和它在字內的筆畫中線各自縮放到 0–1，逐筆比較起點和終點。
2. 首尾位置：首碼部件應在尾碼部件的左面、上面或外面；首碼明顯在尾碼右下方的字列出來。
輸出 tools/out/audit.json 和摘要。用法：python3 tools/audit_glyphs.py /path/to/makemeahanzi"""
import json, sys, os, math
MM = sys.argv[1]
P = json.load(open('tools/out/provenance.json', encoding='utf-8'))
MED = {}
for line in open(f'{MM}/graphics.txt', encoding='utf-8'):
    o = json.loads(line); MED[o['character']] = o['medians']
Z = json.load(open('data/zh-codes.json', encoding='utf-8'))
RANK = {c: i for i, c in enumerate(Z['common'])}

def norm(meds):
    """每軸各自縮放到 0–1（部件作偏旁時會被壓窄，所以不保持比例）"""
    pts = [p for m in meds for p in m]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w = max(x1 - x0, 1); h = max(y1 - y0, 1)
    return [[((p[0] - x0) / w, (p[1] - y0) / h) for p in m] for m in meds]

def sdist(x, y):
    return math.dist(x[0], y[0]) + math.dist(x[-1], y[-1]) + math.dist(x[len(x) // 2], y[len(y) // 2])

def order_score(comp, ch, idxs):
    """回傳 (不符筆數, 說明)：部件第 i 筆在字內最像的不是第 i 筆、而且明顯較像別一筆，就算不符"""
    if comp not in MED or ch not in MED or len(MED[comp]) != len(idxs): return None
    a = norm(MED[comp]); b = norm([MED[ch][i] for i in idxs])
    bad = []
    for i, x in enumerate(a):
        d = [sdist(x, y) for y in b]
        j = min(range(len(b)), key=lambda k: d[k])
        if j != i and d[i] > d[j] * 1.8 + 0.25: bad.append((i, j))
    return bad

flags_order, flags_pos = [], []
for ch, pv in P.items():
    for side in ('f', 'l'):
        for rule, comp, idxs, depth in pv[side]:
            if depth == 0 or comp == ch: continue
            bad = order_score(comp, ch, idxs)
            if bad:
                flags_order.append({'ch': ch, 'side': side, 'comp': comp, 'rule': rule, 'swap': bad})
# 首尾位置
for f in [x for x in os.listdir('assets/glyphs') if x.endswith('.json')]:
    g = json.load(open(f'assets/glyphs/{f}', encoding='utf-8'))
    ch = chr(int(f[:-5], 16))
    if 'r' not in g or ch not in MED: continue
    r = g['r']
    fi = [i for i, x in enumerate(r) if x == 'f' or (x == 's' and 'f' in g.get('c', {}).get(str(i), [None, None, []])[-1])]
    li = [i for i, x in enumerate(r) if x == 'l' or (x == 's' and 'l' in g.get('c', {}).get(str(i), [None, None, []])[-1])]
    if not fi or not li: continue
    def box(ix):
        pts = [p for i in ix for p in MED[ch][i]]
        return min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts)
    fb, lb = box(fi), box(li)
    fcx, fcy = (fb[0] + fb[1]) / 2, (fb[2] + fb[3]) / 2
    lcx, lcy = (lb[0] + lb[1]) / 2, (lb[2] + lb[3]) / 2
    encl = fb[0] <= lb[0] + 30 and fb[1] >= lb[1] - 30 and fb[3] >= lb[3] - 30
    if not encl and fcx > lcx + 120 and fcy < lcy - 60:
        flags_pos.append({'ch': ch, 'dx': round(fcx - lcx), 'dy': round(fcy - lcy)})
key = lambda x: RANK.get(x['ch'], 99999)
flags_order.sort(key=key); flags_pos.sort(key=key)
os.makedirs('tools/out', exist_ok=True)
json.dump({'order': flags_order, 'position': flags_pos}, open('tools/out/audit.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print('部件筆序可疑：', len(flags_order), '字；按部件：', Counter(f"{x['comp']}{x['side']}" for x in flags_order).most_common(40))
print('首尾位置可疑：', len(flags_pos), ''.join(x['ch'] for x in flags_pos[:200]))

# ---- 筆序不符會不會令顏色標錯？比較「現在上色的筆」和「按最相似筆畫對應後應上色的筆」----
def best_map(comp, ch, idxs):
    a = norm(MED[comp]); b = norm([MED[ch][i] for i in idxs])
    from itertools import permutations
    n = len(a)
    cost = [[sdist(x, y) for y in b] for x in a]
    if n <= 7:
        best = min(permutations(range(n)), key=lambda p: sum(cost[i][p[i]] for i in range(n)))
    else:   # 貪婪
        used, best = set(), []
        for i in range(n):
            j = min((k for k in range(n) if k not in used), key=lambda k: cost[i][k]); used.add(j); best.append(j)
    return [idxs[j] for j in best]

real = []
for x in flags_order:
    ch, side, comp = x['ch'], x['side'], x['comp']
    g = json.load(open(f'assets/glyphs/{ord(ch):x}.json', encoding='utf-8'))
    r, cuts = g['r'], g.get('c', {})
    idxs = next(i for rule, c, i, d in P[ch][side] if c == comp)
    colored = [k for k, gi in enumerate(idxs) if r[gi] == side or (r[gi] == 's' and side in cuts.get(str(gi), [None, None, []])[-1])]
    m = best_map(comp, ch, idxs)
    should = sorted(m[k] for k in colored)
    now = sorted(idxs[k] for k in colored)
    if should != now: real.append({**x, 'now': now, 'should': should})
real.sort(key=key)
json.dump({'order': flags_order, 'position': flags_pos, 'order_effect': real}, open('tools/out/audit.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('會令顏色改變的筆序不符：', len(real), '字')
print(' '.join(f"{x['ch']}{x['side']}{x['comp']}" for x in real))

# ---- 倉頡只有兩碼的字：每一筆都屬首碼或尾碼，不應有灰色筆畫 ----
grey2 = []
for f in [x for x in os.listdir('assets/glyphs') if x.endswith('.json')]:
    g = json.load(open(f'assets/glyphs/{f}', encoding='utf-8'))
    ch = chr(int(f[:-5], 16))
    cj = Z['cj'].get(ch, '')
    if 'r' not in g or len(cj) != 2: continue
    r = g['r']; cuts = g.get('c', {})
    grey = [i for i, x in enumerate(r) if x == '.' or (x == 's' and '.' in cuts.get(str(i), [None, None, []])[-1])]
    if grey: grey2.append({'ch': ch, 'cj': cj, 'grey': grey})
grey2.sort(key=key)
json.dump({'order': flags_order, 'position': flags_pos, 'order_effect': real, 'grey2': grey2}, open('tools/out/audit.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('兩碼字有灰色筆畫：', len(grey2), '字')
print(' '.join(f"{x['ch']}{x['cj']}" for x in grey2))
