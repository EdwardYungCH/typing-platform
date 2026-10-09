#!/usr/bin/env python3
"""產生「速成雙色拆碼圖」資料：每個字的筆畫（Make Me a Hanzi，Arphic PL UKai 字形，Arphic Public License），
並標出哪些筆畫屬首碼字根、哪些屬尾碼字根。

做法：沿 Make Me a Hanzi 的部件分解樹，首碼一路取最前的部件、尾碼一路取最後的部件，
直至部件本身就是該字根（或其輔助字形）。部件對不上倉頡碼的字一律不上色，免得教錯。
輸出：assets/glyphs/<字的 Unicode 十六進位>.json  {"s":[筆畫路徑...], "r":"ff..ll"}（f 首碼、l 尾碼、. 其他）
用法：python3 tools/build_zh_glyphs.py /path/to/makemeahanzi
"""
import json, os, sys
MM = sys.argv[1]
Z = json.load(open('data/zh-codes.json', encoding='utf-8'))
SH = json.load(open('data/zh-shapes.json', encoding='utf-8'))['keys']
ROOTS = dict(zip('abcdefghijklmnopqrstuvwyx', '日月金木水火土竹戈十大中一弓人心手口尸廿山女田卜難'))
first = {}
for code in sorted(Z['quick']):
    for ch in Z['quick'][code]:
        first.setdefault(ch, code)
first.update(Z['qfix'])

dic = {}
for line in open(f'{MM}/dictionary.txt', encoding='utf-8'):
    o = json.loads(line); dic[o['character']] = o
gfx = {}
need = set(Z['common'][:3000])
for p in ('data/zh-lessons.json',):
    for l in json.load(open(p, encoding='utf-8'))['lessons']:
        for s in l['steps']:
            need |= set(s.get('text', '') + s.get('gen', {}).get('chars', ''))
for line in open(f'{MM}/graphics.txt', encoding='utf-8'):
    o = json.loads(line)
    if o['character'] in need or o['character'] in dic:
        gfx[o['character']] = o['strokes']

# 部件 → 字根鍵（只接受「整個部件就是一個字根」的情況）
EXTRA = {'氵': 'e', '亻': 'o', '扌': 'q', '忄': 'p', '艹': 't', '宀': 'j', '辶': 'y', '灬': 'f', '⺌': 'f', '⺍': 'f',
         '冖': 'b', '冂': 'b', '爫': 'b', '⺈': 'n', '厶': 'i', '广': 'i', '疒': 'k', '犭': 'k', '衤': 'l', '礻': 'y',
         '囗': 'w', '匚': 's', '尸': 's', '丷': 'c', '八': 'c', '亠': 'y', '丶': 'i', '丿': 'h', '丨': 'l', '乚': 'u',
         '凵': 'u', '幺': 'v', '彐': 's', '匕': 'p', '勹': 'p', '乂': 'k', '工': 'm', '厂': 'm', '士': 'g', '曰': 'a', '又': 'e'}
def keys_of(c):
    ks = set()
    for k, r in ROOTS.items():
        if r == c: ks.add(k)
    for k, lst in SH.items():
        for s in lst:
            if s['shape'] == c: ks.add(k)
    if c in EXTRA: ks.add(EXTRA[c])
    cj = Z['cj'].get(c)
    if cj and len(cj) == 1: ks.add(cj)
    return ks

OPS2 = set('⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻'); OPS3 = set('⿲⿳')
def parse(s, i=0):
    c = s[i]
    if c in OPS2 or c in OPS3:
        n = 3 if c in OPS3 else 2
        kids, j = [], i + 1
        for _ in range(n):
            k, j = parse(s, j); kids.append(k)
        return ('op', c, kids), j
    return ('leaf', c), i + 1

def strokes_of_child(matches, path, depth_idx):
    return [i for i, m in enumerate(matches) if m is not None and len(m) > depth_idx and m[:depth_idx + 1] == path]

def find(char, idxs, want, side, depth=0):
    """在 char（筆畫索引 idxs 對應整字的筆畫）裏找出屬 want 鍵的首／尾部件筆畫。"""
    if depth > 6: return None
    if want in keys_of(char) and depth > 0:
        return idxs
    o = dic.get(char)
    if not o or not o.get('decomposition') or '？' in o['decomposition'][:1]:
        return None
    try:
        tree, _ = parse(o['decomposition'])
    except Exception:
        return None
    if tree[0] != 'op': return None
    matches = o['matches']
    if len(matches) != len(idxs): return None
    kids = tree[2]
    order = range(len(kids)) if side == 'f' else range(len(kids) - 1, -1, -1)
    # 外內結構（⿴⿵⿶⿷⿸⿹⿺）取尾碼時，最後一碼通常在內部件
    for ki in order:
        node = kids[ki]
        sub = [idxs[i] for i, m in enumerate(matches) if m and m[0] == ki]
        if not sub: return None
        if node[0] == 'leaf':
            return find(node[1], sub, want, side, depth + 1) if node[1] != '？' else None
        # 子樹本身是 IDS：用整字的 matches 再往下一層
        sub_matches = [m[1:] for m in matches if m and m[0] == ki]
        return find_tree(node, sub, sub_matches, want, side, depth + 1)
    return None

def find_tree(node, idxs, matches, want, side, depth):
    kids = node[2]
    order = range(len(kids)) if side == 'f' else range(len(kids) - 1, -1, -1)
    for ki in order:
        child = kids[ki]
        sub = [idxs[i] for i, m in enumerate(matches) if m and m[0] == ki]
        if not sub: return None
        if child[0] == 'leaf':
            return find(child[1], sub, want, side, depth + 1) if child[1] != '？' else None
        return find_tree(child, sub, [m[1:] for m in matches if m and m[0] == ki], want, side, depth + 1)
    return None

os.makedirs('assets/glyphs', exist_ok=True)
ok = fail = 0
fails = []
for ch in sorted(need):
    if ch not in gfx or ch not in first: continue
    strokes = gfx[ch]; n = len(strokes); q = first[ch]
    roles = ['.'] * n
    if len(q) == 1:
        roles = ['f'] * n if q in keys_of(ch) or len(Z['cj'].get(ch, 'xx')) == 1 else roles
        good = roles[0] == 'f'
    else:
        f = find(ch, list(range(n)), q[0], 'f')
        l = find(ch, list(range(n)), q[1], 'l')
        good = bool(f and l and not set(f) & set(l) and len(f) < n and len(l) < n)
        if good:
            for i in f: roles[i] = 'f'
            for i in l: roles[i] = 'l'
    if good: ok += 1
    else: fail += 1; fails.append(ch)
    out = {'s': strokes}
    if good: out['r'] = ''.join(roles)
    json.dump(out, open(f'assets/glyphs/{ord(ch):x}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('上色成功', ok, '未能上色', fail)
print('未能上色例子：', ''.join(fails[:80]))
