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
MED = {}   # 每字每筆的中線（切筆用）
need = set(Z['common'][:3000])
COMMON_KEEP = set(Z['common'][:1500])   # 常用 1500 字就算未能上色也保留筆畫，令練習區、每日任務的字體一致
LESSON_CHARS = set()
for p in ('data/zh-lessons.json',):
    for l in json.load(open(p, encoding='utf-8'))['lessons']:
        for s in l['steps']:
            need |= set(s.get('text', '') + s.get('gen', {}).get('chars', ''))
            LESSON_CHARS |= set(s.get('text', '') + s.get('gen', {}).get('chars', ''))
            for sl in s.get('slides', []): LESSON_CHARS |= set(sl.get('codes', '') + sl.get('example', ''))
# 輔助字形例字（data/zh-shapes.json 的 chartInfo）也要有筆畫，否則字體不一致
for v in json.load(open('data/zh-shapes.json', encoding='utf-8')).get('chartInfo', {}).values():
    for ex in v['examples']: LESSON_CHARS.add(ex[0])
need |= LESSON_CHARS
for line in open(f'{MM}/graphics.txt', encoding='utf-8'):
    o = json.loads(line)
    if o['character'] in need or o['character'] in dic:
        gfx[o['character']] = o['strokes']
        MED[o['character']] = o['medians']

# 部件 → 字根鍵（只接受「整個部件就是一個字根」的情況）
EXTRA = {'氵': 'e', '亻': 'o', '扌': 'q', '忄': 'p', '艹': 't', '宀': 'j', '辶': 'y', '灬': 'f', '⺌': 'f', '⺍': 'f',
         '冖': 'b', '冂': 'b', '爫': 'b', '⺈': 'n', '厶': 'i', '广': 'i', '疒': 'k', '犭': 'k', '衤': 'l', '礻': 'y',
         '囗': 'w', '匚': 's', '尸': 's', '丷': 'c', '八': 'c', '亠': 'y', '丶': 'i', '丿': 'h', '丨': 'l', '乚': 'u',
         '凵': 'u', '幺': 'v', '匕': 'p',
         '⺻': 'l', '龶': 'q', '⺗': 'p', '乛': 'n', '亅': 'n', '𠂉': 'o', '丆': 'm', '𠂇': 'k', '勹': 'p', '乂': 'k', '工': 'm', '厂': 'm', '士': 'g', '曰': 'a', '又': 'e', '釒': 'c', '⺼': 'b', '飠': 'o', '訁': 'y', '糹': 'v', '𥫗': 'h', '几': 'uc', '匸': 's', '⺮': 'h'}
def keys_of(c):
    ks = set()
    for k, r in ROOTS.items():
        if r == c: ks.add(k)
    for k, lst in SH.items():
        for s in lst:
            if s['shape'] == c: ks.add(k)
    if c in EXTRA: ks.update(EXTRA[c])   # 可以多於一個鍵，例如 几 在字底是 山（亮）、也可以是 八（真）
    if c == '丷': ks.discard('t')   # 廿 的「䒑」比 丷 多一橫，只用 丷 會少標一筆
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

# 部分部件：只有前幾筆才是該字根（例如 ⺮ 的左半是竹、夕 的頭兩筆是弓的輔助字形）
UNKNOWN_OK = set('左右有友灰刀己畏')
# 值：正數＝頭幾筆、負數＝尾幾筆、清單＝指定第幾筆（負數由尾數起）。筆順依 Make Me a Hanzi。
PARTIAL = {('夕', 'n', 'f'): 2, ('幺', 'v', 'f'): 1,
           ('阝', 'n', 'f'): 1, ('阝', 'l', 'l'): -1, ('彳', 'h', 'f'): 1, ('寸', 'i', 'l'): -1, ('寸', 'd', 'f'): 2,
           ('隹', 'o', 'f'): 2, ('隹', 'g', 'l'): -3, ('艮', 'a', 'f'): 3, ('艮', 'v', 'l'): -3, ('子', 'd', 'l'): -2, ('子', 'n', 'f'): 1,
            ('斤', 'l', 'l'): -1, ('斤', 'h', 'f'): 2, ('車', 'j', 'f'): [0, -1], ('車', 'j', 'l'): [-2, -1],
           ('羊', 't', 'f'): 3, ('羊', 'q', 'l'): -3, ('皿', 'b', 'f'): 2, ('皿', 't', 'l'): -3, ('門', 'a', 'f'): 4, ('門', 'n', 'l'): -4,
           ('巾', 'l', 'f'): [2], ('巾', 'b', 'l'): [0, 1], ('虫', 'l', 'f'): 4, ('虫', 'i', 'l'): -1, ('衣', 'y', 'f'): 2, ('衣', 'v', 'l'): -3,
           ('礻', 'i', 'f'): 1, ('礻', 'f', 'l'): -3, ('虍', 'y', 'f'): 2, ('罒', 'w', 'f'): [0, 1, 2, -1], ('罒', 'l', 'l'): [3],
           ('耳', 's', 'f'): 2, ('耳', 'j', 'l'): [2, -1], ('目', 'b', 'f'): 2, ('目', 'u', 'l'): [-1], ('牛', 'h', 'f'): 1, ('牛', 'q', 'l'): -3,
           ('止', 'y', 'f'): 2, ('止', 'm', 'l'): -1, ('巴', 'a', 'f'): 3, ('巴', 'u', 'l'): -1, ('米', 'f', 'f'): 2, ('米', 'd', 'l'): -4,
           ('疋', 'n', 'f'): 1, ('疋', 'o', 'l'): -2, ('覀', 'm', 'f'): 1, ('也', 'p', 'f'): 1, ('也', 'd', 'l'): -2,
           ('甘', 't', 'f'): [0, 1, 2, -1], ('甘', 'm', 'l'): [3], ('皮', 'd', 'f'): [0, 2], ('皮', 'e', 'l'): -2, ('臼', 'h', 'f'): 1,
           ('母', 'w', 'f'): 2, ('母', 'i', 'l'): -1, ('夬', 'd', 'f'): 2, ('夬', 'k', 'l'): -2, ('亥', 'y', 'f'): 2, ('亥', 'o', 'l'): -2,
           ('犬', 'k', 'l'): [0, 1, 2], ('犬', 'i', 'l'): -1, ('舟', 'h', 'f'): 1, ('舟', 'i', 'l'): -1, ('卩', 's', 'f'): 1, ('卩', 'l', 'l'): -1,
           ('豆', 'm', 'f'): 1, ('豆', 't', 'l'): -3, ('才', 'k', 'f'): [0, 2], ('才', 'd', 'f'): 2, ('才', 'h', 'l'): -1,
           ('丁', 'm', 'f'): 1, ('丁', 'n', 'l'): -1, ('豕', 'm', 'f'): 1, ('豕', 'o', 'l'): -2, ('之', 'i', 'f'): 1, ('之', 'o', 'l'): -2,
           ('足', 'r', 'f'): 3, ('足', 'o', 'l'): -2,  ('甲', 'w', 'f'): [0, 1, 2, 3], ('甲', 'l', 'l'): -1,
           ('介', 'o', 'f'): 2, ('介', 'l', 'l'): -1, ('方', 'y', 'f'): 2, ('方', 's', 'l'): -2, ('用', 'b', 'f'): 2, ('用', 'q', 'l'): -3,
           ('年', 'o', 'f'): 2, ('年', 'q', 'l'): -4, ('以', 'v', 'f'): 1, ('以', 'o', 'l'): -2, ('白', 'h', 'f'): 1, ('白', 'a', 'l'): -4,
           ('先', 'h', 'f'): 1, ('先', 'u', 'l'): -1, ('向', 'h', 'f'): 1, ('向', 'r', 'l'): -3, ('戶', 'h', 'f'): 1, ('戶', 's', 'l'): -3,
           ('制', 'h', 'f'): 1, ('制', 'n', 'l'): -1, ('學', 'h', 'f'): 1, ('學', 'd', 'l'): -2, ('身', 'h', 'f'): 1, ('身', 'h', 'l'): -1,
           ('長', 's', 'f'): 2, ('長', 'v', 'l'): -3, ('司', 's', 'f'): 1, ('司', 'r', 'l'): -3, ('自', 'h', 'f'): 1, ('自', 'u', 'l'): [-1],
           ('馬', 's', 'f'): 1, ('馬', 'f', 'l'): -4, ('聿', 'q', 'l'): -3, ('雨', 'm', 'f'): 1, ('雨', 'y', 'l'): -4,
           ('面', 'm', 'f'): 1, ('非', 'l', 'f'): 1, ('非', 'y', 'l'): -3, ('片', 'l', 'f'): [0], ('片', 'l', 'l'): -1,
           ('五', 'm', 'f'): 1, ('五', 'm', 'l'): -1, ('亞', 'm', 'f'): 1, ('亞', 'm', 'l'): -1, ('互', 'm', 'f'): 1, ('互', 'm', 'l'): -1,
           ('不', 'm', 'f'): 1, ('不', 'f', 'l'): -3, ('上', 'y', 'f'): 2, ('上', 'm', 'l'): -1, ('入', 'o', 'f'): 1, ('入', 'h', 'l'): -1,
           ('已', 's', 'f'): 1, ('已', 'u', 'l'): -1, ('而', 'm', 'f'): 2, ('而', 'l', 'l'): -1, ('七', 'j', 'f'): 1, ('七', 'u', 'l'): -1,
           ('州', 'i', 'f'): 1, ('州', 'l', 'l'): -1, ('承', 'n', 'f'): 1, ('承', 'o', 'l'): -2, ('爾', 'm', 'f'): 1, ('爾', 'k', 'l'): -2,
           ('敢', 'm', 'f'): 1, ('敢', 'k', 'l'): -2, ('北', 'l', 'f'): 1, ('北', 'p', 'l'): -2, ('冓', 't', 'f'): [0, 1, 2, 3], ('冓', 'b', 'l'): [5, 6],
           ('扁', 'h', 'f'): 1, ('扁', 'b', 'l'): [4, 5], ('戠', 'y', 'f'): 2, ('戠', 'a', 'l'): [5, 6, 7, 8],
           ('睘', 'w', 'f'): 5, ('睘', 'v', 'l'): -3, ('业', 't', 'f'): [0, 1, -1], ('癶', 'n', 'f'): 1, ('开', 't', 'l'): [1, 2, 3], ('开', 'm', 'f'): 1,
           ('户', 'h', 'f'): 1, ('户', 's', 'l'): -3, ('無', 'o', 'f'): 2, ('無', 'f', 'l'): -4, ('每', 'o', 'f'): 2, ('每', 'i', 'l'): -1,
           ('矢', 'o', 'f'): 2, ('矢', 'k', 'l'): -2, ('矦', 'k', 'l'): -2, ('立', 'y', 'f'): 1, ('立', 't', 'l'): -3, ('斗', 'y', 'f'): 2, ('斗', 'j', 'l'): -2,
           ('單', 'r', 'f'): 3, ('單', 'j', 'l'): -2, ('華', 't', 'f'): 3, ('華', 'j', 'l'): -2, ('並', 't', 'f'): 3, ('並', 'c', 'l'): [5, 6],
           ('首', 't', 'f'): 3, ('首', 'u', 'l'): [-1], ('雚', 't', 'f'): 3, ('雚', 'g', 'l'): -3, ('氐', 'h', 'f'): 1, ('氐', 'm', 'l'): -1,
           ('酉', 'm', 'f'): 1, ('酉', 'w', 'l'): [1, 2, -2, -1], ('余', 'o', 'f'): 2, ('余', 'd', 'l'): -4, ('袁', 'g', 'f'): 3, ('袁', 'v', 'l'): -3,
           ('㠯', 'r', 'l'): -3, ('彔', 'e', 'l'): -4, ('爭', 'd', 'l'): -1, ('于', 'm', 'f'): 1, ('于', 'd', 'l'): -1, ('蒦', 't', 'f'): 3, ('蒦', 'e', 'l'): -2,
           ('牙', 'm', 'f'): 1, ('牙', 'h', 'l'): -1, ('尤', 'i', 'f'): [3], ('尤', 'u', 'l'): [2], ('為', 'i', 'f'): 1, ('生', 'h', 'f'): 1, ('生', 'm', 'l'): -1,
           ('幺', 'i', 'l'): -1, ('手', 'h', 'f'): 1, ('手', 'q', 'l'): -3, ('於', 'y', 'l'): -2, ('乍', 'h', 'f'): 1, ('乍', 's', 'l'): -4,
           ('黑', 'w', 'f'): 5, ('黑', 'f', 'l'): -4, ('重', 'h', 'f'): 1, ('重', 'g', 'l'): -3, ('同', 'b', 'f'): 2, ('同', 'r', 'l'): -3,
           ('骨', 'b', 'f'): 2, ('婁', 'l', 'f'): 1, ('婁', 'v', 'l'): -3, ('裏', 'v', 'l'): -3, ('玉', 'g', 'l'): [1, 2, 3], ('千', 'h', 'f'): 1, ('千', 'j', 'l'): -2,
           ('平', 'm', 'f'): 1, ('平', 'j', 'l'): -2, ('兩', 'o', 'l'): -2, ('弟', 'c', 'f'): 2, ('弟', 'h', 'l'): -1, ('覺', 'h', 'f'): 1, ('覺', 'u', 'l'): -1,
           ('我', 'h', 'f'): 1, ('我', 'i', 'l'): -3, ('九', 'k', 'f'): 1, ('九', 'n', 'l'): -1, ('今', 'o', 'f'): 2, ('今', 'n', 'l'): -1,
           ('共', 't', 'f'): 4, ('共', 'c', 'l'): -2, ('包', 'p', 'f'): 2, ('包', 'u', 'l'): -1, ('川', 'l', 'f'): 1, ('川', 'l', 'l'): -1,
           ('東', 'd', 'f'): [0, 6, 7], ('東', 'w', 'l'): [1, 2, 3, 4, 5], ('甬', 'n', 'f'): 1, ('甬', 'b', 'l'): [2, 3],
           ('由', 'l', 'f'): [3], ('由', 'w', 'l'): [0, 1, 2, 4], ('丙', 'm', 'f'): 1, ('丙', 'b', 'l'): [1, 2],
           # 輔助字形例字（整字層面；筆序已逐筆核對 Make Me a Hanzi）
           ('冊', 'b', 'f'): [0, 1], ('冊', 't', 'l'): [2, 3, 4], ('四', 'w', 'f'): [0, 1, 4], ('四', 'c', 'l'): [2, 3],
           ('匹', 's', 'f'): [0, 3], ('匹', 'c', 'l'): [1, 2], ('反', 'h', 'f'): 2, ('反', 'e', 'l'): -2,
           ('求', 'i', 'f'): [6], ('求', 'e', 'l'): [2, 3, 4, 5], ('弁', 'i', 'f'): 2, ('弁', 't', 'l'): -3,
           ('刁', 's', 'f'): [0], ('刁', 'm', 'l'): [1], ('原', 'm', 'f'): 2, ('原', 'f', 'l'): -3,
           ('乞', 'o', 'f'): 2, ('乞', 'n', 'l'): -1, ('丘', 'o', 'f'): 4, ('丘', 'm', 'l'): -1, ('午', 'o', 'f'): 2, ('午', 'j', 'l'): -2,
           ('尺', 's', 'f'): 3, ('尺', 'o', 'l'): -1, ('弋', 'i', 'f'): [2], ('弋', 'p', 'l'): [0, 1], ('半', 'f', 'f'): 2, ('半', 'q', 'l'): -3,
           ('夫', 'q', 'f'): 3, ('夫', 'o', 'l'): -1, ('降', 'q', 'l'): -3, ('尹', 's', 'f'): 2, ('尹', 'k', 'l'): -2,
           ('君', 's', 'f'): 2, ('君', 'r', 'l'): -3, ('收', 'v', 'f'): [0], ('收', 'k', 'l'): -2, ('亡', 'y', 'f'): 2, ('亡', 'v', 'l'): -1,
           ('世', 'p', 'f'): [3, 4], ('世', 't', 'l'): [0, 1, 2], ('戒', 'i', 'f'): [0, 4, 5, 6], ('戒', 't', 'l'): [1, 2, 3],
           ('貞', 'y', 'f'): 2, ('貞', 'c', 'l'): -2, ('占', 'y', 'f'): 2, ('占', 'r', 'l'): -3, ('冬', 'h', 'f'): 1, ('冬', 'y', 'l'): -2,
           ('寒', 'y', 'l'): -2, ('百', 'm', 'f'): 2, ('后', 'h', 'f'): 2, ('后', 'r', 'l'): -3,
           ('存', 'k', 'f'): [0, 1], ('在', 'k', 'f'): [0, 1],
           ('石', 'm', 'f'): 2, ('石', 'r', 'l'): -3, ('書', 'l', 'f'): [0, 1, 2, 4], ('畫', 'l', 'f'): [0, 1, 2, 4], ('盡', 'l', 'f'): [0, 1, 2, 3]}

# ---- 切筆：速成拆字可以在直線上切開一筆（不在轉角切），例如 力 的橫、久 的撇、史 的撇 ----
# 規則傳入該部件在整字的筆畫索引 idxs 和整字中線 M，回傳 [筆索引 或 ('cut', 筆索引, 'x'|'y', 值, 'lo'|'hi')]
# 'lo'＝座標小於該值的一段、'hi'＝大於等於的一段（Make Me a Hanzi 座標：x 向右、y 向上）。
def _cross(p, q):
    """兩條中線第一個交點"""
    for (a, b) in zip(p, p[1:]):
        for (c, d) in zip(q, q[1:]):
            den = (b[0]-a[0])*(d[1]-c[1]) - (b[1]-a[1])*(d[0]-c[0])
            if not den: continue
            t = ((c[0]-a[0])*(d[1]-c[1]) - (c[1]-a[1])*(d[0]-c[0])) / den
            u = ((c[0]-a[0])*(b[1]-a[1]) - (c[1]-a[1])*(b[0]-a[0])) / den
            if 0 <= t <= 1 and 0 <= u <= 1: return (a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]))
    return None
def _li(idxs, M, part):
    # 力：idxs[0] 橫折鈎、idxs[1] 撇。撇和橫相交處直切：左邊一小段屬 大，其餘屬 尸
    a, b = idxs[0], idxs[1]
    pt = _cross(M[a], M[b])
    if not pt: return None
    return [b, ('cut', a, 'x', round(pt[0]), 'lo')] if part == 'k' else [('cut', a, 'x', round(pt[0]), 'hi')]
def _jiu(idxs, M, part):
    # 久：idxs[1] 橫撇。轉角之下、撇的直線上橫切：上段連 丿 屬 弓，下段連 捺 屬 人
    a, b, c = idxs
    cy = max(M[b], key=lambda p: p[0])[1] - 110
    return [a, ('cut', b, 'y', round(cy), 'hi')] if part == 'n' else [c, ('cut', b, 'y', round(cy), 'lo')]
def _shi(idxs, M, part):
    # 史：口 下面那一橫處橫切長撇：上段連 口 屬 中，下段連 捺 屬 大
    y = min(p[1] for p in M[idxs[2]]) - 25
    return [idxs[0], idxs[1], idxs[2], ('cut', idxs[3], 'y', round(y), 'hi')] if part == 'l' else [idxs[4], ('cut', idxs[3], 'y', round(y), 'lo')]
CUTS = {('力', 'k', 'f'): lambda i, M: _li(i, M, 'k'), ('力', 's', 'l'): lambda i, M: _li(i, M, 's'),
        ('久', 'n', 'f'): lambda i, M: _jiu(i, M, 'n'), ('久', 'o', 'l'): lambda i, M: _jiu(i, M, 'o'),
        ('史', 'l', 'f'): lambda i, M: _shi(i, M, 'l'), ('史', 'k', 'l'): lambda i, M: _shi(i, M, 'k')}

def partial_idx(v, idxs):
    if isinstance(v, list): return [idxs[i] for i in v]
    return idxs[:v] if v > 0 else idxs[v:]
# 幾個部件合起來才是一個字根（例如 丷＋一 ＝ 廿）
COMPOSITE = {'⿱丷一': 't', '⿱䒑': 't'}

def unknown(decomp, idxs, matches, want, side, char):
    """分解式只有一個「？」部件（例如 左 ＝ ⿸？工）時，「？」的筆畫就是 matches 為空的筆畫。
    只在最外層使用，並要求倉頡碼的首／尾碼跟 want 一致（已由呼叫者保證）。"""
    # 只用於人手看過、確認「？」部件剛好是該字根的字
    if decomp.count('？') != 1 or char != TOP[0] or char not in UNKNOWN_OK:
        return None
    sub = [idxs[i] for i, m in enumerate(matches) if m is None]
    if not sub or len(sub) >= len(idxs): return None
    MATCHED.append('？')
    return sub

STACK = set()
ROLE_CACHE = {}
def comp_roles(char, want, side):
    """部件 char 自己的倉頡碼首／尾鍵等於 want 時，回傳它本身第幾筆屬該鍵（局部索引）。"""
    cj = Z['cj'].get(char)
    n = len(gfx.get(char, []))
    if not cj or not n: return None
    key = cj[0] if side == 'f' else cj[-1]
    if key != want: return None
    ck = (char, side)
    if ck in ROLE_CACHE: return ROLE_CACHE[ck]
    if len(cj) == 1:
        ROLE_CACHE[ck] = list(range(n)); return ROLE_CACHE[ck]
    STACK.add(char)
    saved = MATCHED[:]
    r = find(char, list(range(n)), want, side, 1)
    MATCHED[:] = saved
    STACK.discard(char)
    if r is not None and (len(r) >= n or any(isinstance(x, tuple) for x in r)): r = None   # 整個部件都算＝沒拆；切筆的座標不能搬到別的字
    ROLE_CACHE[ck] = r
    return r

def find(char, idxs, want, side, depth=0):
    """在 char（筆畫索引 idxs 對應整字的筆畫）裏找出屬 want 鍵的首／尾部件筆畫。"""
    if depth > 6: return None
    part = PARTIAL.get((char, want, side))
    if part and len(idxs) > (len(part) if isinstance(part, list) else abs(part)):
        MATCHED.append(char)
        return partial_idx(part, idxs)
    cut = CUTS.get((char, want, side))
    if cut and TOP[0] in MED and len(idxs) == len(gfx.get(char, [])):
        r = cut(idxs, MED[TOP[0]])
        if r:
            MATCHED.append(char)
            return r
    if want in keys_of(char) and depth > 0:
        MATCHED.append(char)
        return idxs
    # 部件本身是一個字、而它自己的倉頡首／尾碼正是要找的鍵：沿用它自己的拆法（例如「的」尾碼 戈 來自「勺」的一點）
    if depth > 0 and char not in STACK:
        loc = comp_roles(char, want, side)
        if loc is not None and len(idxs) == len(gfx.get(char, [])):
            MATCHED.append(char)
            return [idxs[i] for i in loc]
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
        if node[0] == 'leaf' and node[1] == '？':
            return unknown(o['decomposition'], idxs, matches, want, side, char)
        if not sub: return None
        if node[0] == 'leaf':
            if node[1] == '？':
                return unknown(o['decomposition'], idxs, matches, want, side, char)
            return find(node[1], sub, want, side, depth + 1)
        # 子樹本身是 IDS：用整字的 matches 再往下一層
        sub_matches = [m[1:] for m in matches if m and m[0] == ki]
        return find_tree(node, sub, sub_matches, want, side, depth + 1)
    return None

def ids_str(node):
    return node[1] if node[0] == 'leaf' else node[1] + ''.join(ids_str(k) for k in node[2])

def find_tree(node, idxs, matches, want, side, depth):
    if COMPOSITE.get(ids_str(node)) == want:
        MATCHED.append(ids_str(node)[1:])
        return idxs
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

MATCHED = []
TOP = [None]
COMP = {}  # (鍵, 部件) -> [(字, 首/尾)]
os.makedirs('assets/glyphs', exist_ok=True)
ok = fail = 0
fails = []
for ch in sorted(need):
    if ch not in gfx or ch not in first: continue
    strokes = gfx[ch]; n = len(strokes); q = first[ch]
    roles = ['.'] * n; cuts = {}
    if len(q) == 1:
        roles = ['f'] * n if q in keys_of(ch) or len(Z['cj'].get(ch, 'xx')) == 1 else roles
        good = roles[0] == 'f'
    else:
        MATCHED.clear()
        TOP[0] = ch
        f = find(ch, list(range(n)), q[0], 'f')
        fc = MATCHED[-1] if f and MATCHED else None
        MATCHED.clear()
        l = find(ch, list(range(n)), q[1], 'l')
        lc = MATCHED[-1] if l and MATCHED else None
        cuts = {}
        good = bool(f and l)
        if good:
            fi = {x for x in f if not isinstance(x, tuple)}; li = {x for x in l if not isinstance(x, tuple)}
            for role, lst, other in (('f', f, li), ('l', l, fi)):
                for x in lst:
                    if isinstance(x, tuple):
                        _, i, ax, v, keep = x
                        c = cuts.setdefault(i, [ax, v, '.', '.'])
                        if i in other or c[0] != ax or c[1] != v or c[2 if keep == 'lo' else 3] != '.': good = False
                        c[2 if keep == 'lo' else 3] = role
            good = good and not fi & li and len(fi) < n and len(li) < n
        if good:
            for i in fi: roles[i] = 'f'
            for i in li: roles[i] = 'l'
            for i in cuts: roles[i] = 's'
            COMP.setdefault(f'{q[0]}|{fc}', []).append([ch, 'f'])
            COMP.setdefault(f'{q[1]}|{lc}', []).append([ch, 'l'])
    if good: ok += 1
    else: fail += 1; fails.append(ch)
    # 沒法上色的字：只有課文用到的才保留筆畫（令練習字體一致），其餘不存
    if not good and ch not in LESSON_CHARS and ch not in COMMON_KEEP: continue
    out = {'s': strokes}
    if good: out['r'] = ''.join(roles)
    if good and len(q) > 1 and cuts: out['c'] = {str(i): c for i, c in cuts.items()}
    json.dump(out, open(f'assets/glyphs/{ord(ch):x}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
os.makedirs('tools/out', exist_ok=True)
json.dump(COMP, open('tools/out/components.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('上色成功', ok, '未能上色', fail)
print('未能上色例子：', ''.join(fails[:80]))
