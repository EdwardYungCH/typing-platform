#!/usr/bin/env python3
"""產生中文速成第 1–15 課，併入 data/zh-lessons.json（第 0 課導覽保持不變）。
需要先有 data/zh-codes.json（見 tools/build_zh_codes.py）。詞語和句子為原創。
用法：python3 tools/gen_zh_lessons.py /path/to/essay.txt（詞頻表目前只用作備用，可省略）
"""
import json, sys

ESSAY = sys.argv[1] if len(sys.argv) > 1 else None
Z = json.load(open('data/zh-codes.json', encoding='utf-8'))
ROOTS = dict(zip('abcdefghijklmnopqrstuvwyx', '日月金木水火土竹戈十大中一弓人心手口尸廿山女田卜難'))
first = {}
for code in sorted(Z['quick']):
    for ch in Z['quick'][code]:
        first.setdefault(ch, code)
first.update(Z['qfix'])
EXCLUDE = set('呵喫縣臺爾啦')  # 詞頻表帶來、但不適合香港初中課堂的字
COMMON = ''.join(c for c in Z['common'] if c not in EXCLUDE)
RANK = {c: i for i, c in enumerate(COMMON)}
PUNCT = set('，。；：？！「」、')
SHAPES = json.load(open('data/zh-shapes.json', encoding='utf-8'))['keys']
import os
# 有雙色拆碼圖（首碼紅、尾碼藍）的字：組合練習優先用這些字
COLORED = set()
for f in os.listdir('assets/glyphs'):
    if f.endswith('.json') and '"r"' in open(f'assets/glyphs/{f}', encoding='utf-8').read():
        COLORED.add(chr(int(f[:-5], 16)))

def idx(ch):
    q = first[ch]
    return Z['quick'][q].index(ch) + 1

def pool(keys, need, maxidx=5, top=2500, n=30, colored=False, two=False):
    out = []
    for ch in COMMON[:top]:
        if colored and ch not in COLORED:
            continue
        if two and len(first.get(ch, '')) != 2:
            continue
        q = first.get(ch)
        if not q or not set(q) <= set(keys) or not set(q) & set(need):
            continue
        if idx(ch) <= maxidx:
            out.append(ch)
    return ''.join(out[:n])

# 每個字的首／尾碼由哪個部件構成（build_zh_glyphs 產生）：過關小測用來揀「考到各種輔助字形」的字
PARTS = {}
if os.path.exists('tools/out/components.json'):
    for key, lst in json.load(open('tools/out/components.json', encoding='utf-8')).items():
        k, comp = key.split('|', 1)
        for ch, side in lst: PARTS.setdefault(ch, set()).add((side, k, comp))

def quiz_pool(learned, new, n_new=36, n_review=12, top=1500):
    """過關小測的字：常用 1500 字內、揀字在第一頁；盡量每個字考到未出現過的部件（輔助字形優先），
    大部分字包含今課新字根，另加少量複習前課。"""
    seen, out = set(), []
    def pick(cands, n):
        cands = list(cands)
        while cands and n > 0:
            def gain(ch):
                parts = PARTS.get(ch, set())
                return sum((2 if comp != ROOTS[k] else 1) for side, k, comp in parts if (k, comp) not in seen)
            best = max(cands, key=lambda c: (gain(c), -RANK[c]))
            if gain(best) == 0: break
            out.append(best); cands.remove(best); n -= 1
            for side, k, comp in PARTS.get(best, set()): seen.add((k, comp))
        # 部件都考過了：用最常用的字補足
        for c in cands:
            if n <= 0: break
            if c not in out: out.append(c); n -= 1
    base = [c for c in COMMON[:top] if first.get(c) and set(first[c]) <= set(learned) and idx(c) <= 9 and c in PARTS]
    pick([c for c in base if set(first[c]) & set(new)], n_new)
    prev = set(learned) - set(new)
    if prev: pick([c for c in base if c not in out and not set(first[c]) & set(new)], n_review)
    return ''.join(out)

def code_keys(chars):
    """這些字要用到的數字鍵（揀字）。"""
    ks = set()
    for ch in chars:
        if ch in PUNCT:
            continue
        i = idx(ch)
        if 1 <= i <= 9:
            ks.add(f'Digit{i}')
    return sorted(ks)

def keycodes(letters):
    return [f'Key{k.upper()}' for k in letters]

def guide(title, slides):
    return {'type': 'guide', 'title': title, 'slides': slides}

def shape_slides(keys):
    """每個字根鍵一頁：逐個教該鍵的全部輔助字形，每個字形 3 個例字（顏色標出位置）。"""
    return [{'title': f'字根「{ROOTS[k]}」（{k.upper()}）的輔助字形',
             'points': ['看到這些部件，都按 ' + k.upper() + ' 鍵',
                        '注意：部件不等於單獨的字，例如「又」作部件屬 水 E，但單獨打「又」字是 弓大（N K）'],
             'shapeKey': k} for k in keys if k != 'x']

def roots_lesson(lid, title, new, learned, extra_hint):
    chars = quiz_pool(learned, new) or pool(learned, new, colored=True)
    combo = pool(learned, new, maxidx=99, top=3000, n=80, colored=True, two=True)
    selfsplit = pool(learned, learned, maxidx=99, top=3000, n=80, colored=True, two=True)
    selfsplit = ''.join(c for c in selfsplit if c not in combo[:20]) or selfsplit
    names = ' '.join(ROOTS[k] for k in new)
    weighted = learned + new * 3
    prev = ''.join(k for k in learned if k not in new)
    review = [{'type': 'drill', 'mode': 'chart', 'title': '複習前課',
               'hint': '先重溫之前學過的字根和輔助字形：看字形，按它所屬的鍵。', 'gen': {'kind': 'chart', 'keys': prev, 'count': 20}}] if prev else []
    return {
        'id': lid, 'title': title, 'subtitle': names,
        'newKeys': keycodes(new) + code_keys(chars) + ['Space'],
        'pass': {'accuracy': 90},
        'steps': review + [
            {'type': 'drill', 'mode': 'roots', 'title': '示範', 'display': 'big',
             'hint': f'{names}：{extra_hint}看字根，按對應的鍵。', 'text': new * 2},
            {'type': 'drill', 'mode': 'roots', 'title': '單鍵',
             'hint': '每個字根三次，記住它的位置。', 'text': ''.join(k * 3 for k in new) * 3},
            guide('輔助字形', shape_slides(new)),
            {'type': 'drill', 'mode': 'chart', 'title': '字形練習',
             'hint': '這一課的輔助字形隨機出現：看字形，按它所屬字根的鍵。', 'gen': {'kind': 'chart', 'keys': new, 'count': 36}},
            {'type': 'drill', 'mode': 'split', 'colored': True, 'title': '組合', 'chartKeys': learned,
             'hint': '常用字以顏色分碼：紅色部件是首碼，藍色部件是尾碼。認出部件，按兩個鍵。',
             'gen': {'kind': 'chars', 'chars': combo, 'count': 20, 'unique': True}},
            {'type': 'drill', 'mode': 'split', 'hints': 'less', 'title': '自行拆字', 'chartKeys': learned,
             'hint': '沒有顏色：自己拆字，打首碼和尾碼。打錯要改正才可繼續，錯三次才顯示答案。',
             'gen': {'kind': 'chars', 'chars': selfsplit, 'count': 20, 'unique': True}},
            {'type': 'test', 'mode': 'quick', 'title': '過關小測',
             'hint': '60 秒內打字：打碼後按數字揀字，可以打錯。準確率達 90% 即過關。',
             'timeLimit': 60, 'pass': {'accuracy': 90},
             'gen': {'kind': 'chars', 'chars': chars, 'count': 60}},
        ],
    }

def quick_lesson(lid, title, subtitle, chars, hint, test_pass, guide=None, count=20, test_count=60, limit=60):
    allk = sorted(set(k for c in chars if c not in PUNCT for k in first[c]))
    steps = []
    if guide:
        steps.append(guide)
    steps += [
        {'type': 'drill', 'mode': 'quick', 'title': '練習', 'hint': hint, 'gen': {'kind': 'chars', 'chars': chars, 'count': count}},
        {'type': 'drill', 'mode': 'quick', 'title': '再練一次', 'hint': '同一批字，試試不看提示也打得到。', 'gen': {'kind': 'chars', 'chars': chars, 'count': count}},
        {'type': 'test', 'mode': 'quick', 'title': '過關小測', 'timeLimit': limit, 'pass': test_pass,
         'hint': f'{limit} 秒內打得愈多愈好。{pass_text(test_pass)}', 'gen': {'kind': 'chars', 'chars': chars, 'count': test_count}},
    ]
    return {'id': lid, 'title': title, 'subtitle': subtitle, 'newKeys': [],
            'pass': test_pass, 'steps': steps}

def pass_text(p):
    parts = []
    if p.get('wpm'): parts.append(f'速度達每分鐘 {p["wpm"]} 字')
    if p.get('accuracy'): parts.append(f'準確率達 {p["accuracy"]}%')
    return '、'.join(parts) + '即過關。'

def text_lesson(lid, title, subtitle, texts, hint, test_pass, limit=90, unit='句'):
    chars = ''.join(texts)
    allk = sorted(set(k for c in chars if c not in PUNCT for k in first[c]))
    steps = [{'type': 'drill', 'mode': 'quick', 'title': (f'第 {i + 1} 段' if len(t) > 30 else f'第 {i + 1} {unit}'),
              'hint': hint, 'text': t} for i, t in enumerate(texts[:-1])]
    steps.append({'type': 'test', 'mode': 'quick', 'title': '過關小測', 'timeLimit': limit, 'pass': test_pass,
                  'hint': f'{limit} 秒內打得愈多愈好。{pass_text(test_pass)}', 'text': texts[-1]})
    # 綜合課：全部鍵都會用到（字母、數字揀字、空白鍵翻頁、標點），不把任何鍵變淡
    return {'id': lid, 'title': title, 'subtitle': subtitle, 'newKeys': [], 'pass': test_pass, 'steps': steps}


ALL = 'abcdefghijklmnopqrstuvwyx'

def fits(c, keys):
    """速成碼的鍵全部已學"""
    return c in first and set(first[c]) <= set(keys)

def rule_chars(chars, keys=ALL):
    return ''.join(c for c in chars if fits(c, keys))

def split_lesson(lid, title, subtitle, slides, chars, hint, keys=ALL, test_pass={'accuracy': 90}, n=20, extra=()):
    """取碼原則課：導覽 → 看顏色拆字（附字形表）→ 自行拆字 → 過關小測。chars 只收速成碼已學的字。"""
    # 只收有雙色拆碼圖的字：答對後「上一題」一定看得到紅藍拆法
    chars = ''.join(dict.fromkeys(c for c in chars if fits(c, keys) and c in COLORED))
    colored = chars
    return {'id': lid, 'title': title, 'subtitle': subtitle, 'newKeys': keycodes(keys.replace('x', '')) + (['KeyX'] if 'x' in keys else []), 'pass': test_pass,
            'steps': [guide(title, slides), *extra,
                      {'type': 'drill', 'mode': 'split', 'colored': True, 'chartKeys': keys, 'title': '看顏色拆字', 'hint': '紅色部件是首碼，藍色部件是尾碼。答對後看清楚拆法，按 Enter 到下一題。', 'gen': {'kind': 'chars', 'chars': colored, 'count': n}},
                      {'type': 'drill', 'mode': 'split', 'hints': 'less', 'chartKeys': keys, 'title': '自行拆字', 'hint': hint + ' 打錯要改正才可繼續。', 'gen': {'kind': 'chars', 'chars': chars, 'count': n, 'unique': True}},
                      {'type': 'test', 'mode': 'split', 'title': '過關小測', 'timeLimit': 60, 'pass': test_pass, 'chartKeys': keys,
                       'hint': f'60 秒內自行拆字，沒有提示，可參考字根表。{pass_text(test_pass)}', 'gen': {'kind': 'chars', 'chars': chars, 'count': 80}}]}

# 拆碼說明（按 docs/cangjie-rules.md；顯示在規則卡、拆字答案和「上一題」）
NOTES = {
    # 取碼次序（第 2 課）
    '昌': '上至下：上面的日是首碼，下面的日是尾碼。',
    '炎': '上至下：兩個火，上火是首碼、下火是尾碼。',
    '林': '左至右：兩個木，左木是首碼、右木是尾碼。',
    '明': '左至右：左邊日是首碼，右邊月是尾碼。',
    # 連體字（第 5 課）
    '早': '連體字：日和十連在一起，首碼日、尾碼十。',
    '白': '連體字：頂上一撇（竹）是首碼，日是尾碼。',
    '太': '連體字：大是首碼，下面的點（戈）是尾碼。',
    '字': '分體字：字首「宀」＝十，字身「子」＝弓木，尾碼木。',
    # 難字（第 10 課）
    '齊': '首難：上面「亠」＝卜，下面難拆的部分用 X → 卜難。',
    '濟': '字首水，字身「齊」的尾碼是 X → 水難。',
    '擠': '字首手，字身「齊」的尾碼是 X → 手難。',
    '臍': '字首月，字身「齊」的尾碼是 X → 月難。',
    '肅': '首難：上面聿字頭＝中，下面難拆 → 中難。',
    '蕭': '字首艹（廿），字身「肅」的尾碼是 X → 廿難。',
    '繡': '字首糹（女），字身「肅」的尾碼是 X → 女難。',
    '簫': '字首竹字頭（竹），字身「肅」的尾碼是 X → 竹難。',
    '嘯': '字首口，字身「肅」的尾碼是 X → 口難。',
    '臼': '首難：第一撇＝竹，其餘難拆 → 竹難。',
    '舀': '字首爫（月），字身「臼」的尾碼是 X → 月難。',
    '滔': '字首水，字身「舀」→「臼」的尾碼是 X → 水難。',
    '稻': '字首禾（竹），最後的「臼」尾碼是 X → 竹難。',
    '插': '字首手，字身「臿」最後的「臼」尾碼是 X → 手難。',
    '陷': '字首阝（弓），字身「臽」最後的「臼」尾碼是 X → 弓難。',
    '舊': '字首艹（廿），最後的「臼」尾碼是 X → 廿難。',
    '卍': '首難：第一筆像弓，其餘難拆 → 弓難。',
    # 字首看位置，不看部首
    '鵬': '左右型：字首是左邊的「月」，不是「朋」。尾碼是鳥底的四點＝火。',
    '雌': '字首是左邊的「止」（卜），不是「此」。尾碼是隹的最後部件＝土。',
    '翁': '上下型：字首是頂部的「八」（金），不是「公」。',
    '剪': '字首是頂部的「䒑」（廿），不是「前」。',
    '馳': '只能左右切：字首「馬」（尸），字身「也」尾碼＝木。',
    '參': '字首是最上面一個小「厶」（戈），不是三個。',
    '疊': '字首是最上面一個「田」，不是三個。',
    # 右上角的點是首碼
    '求': '右上角的點先取：首碼＝戈。',
    '我': '左上角一撇＝竹是首碼，右邊「戈」是尾碼。',
    '成': '右上角的點先取：首碼＝戈；最後的部件＝尸。',
    '式': '右上角的點先取：首碼＝戈；工的最後一筆＝一。',
    '戒': '右上角的點先取：首碼＝戈；廾＝廿。',
    # 取碼原則
    '王': '精簡原則：一土（2 碼），不是一十一（3 碼）。',
    '夫': '完整原則：首碼取涵蓋筆劃較多的「手」（二橫一撇），不是十。',
    '九': '字形特徵：尾碼是鉤＝弓，不能把鉤切掉當山。',
    '青': '精簡＋完整：上面二橫一豎＝手，不是十十一。',
    '生': '完整原則：竹手一，不是竹十土。',
    # 包含省略
    '海': '包含省略：字身「每」超過 3 碼，被框住的「戈」省去，尾碼取外框的「卜」。',
    '船': '包含省略：字首「舟」超過 2 碼，省去框內的戈，取「卜」作字首尾碼；全字尾碼＝口。',
    '滿': '包含省略：字身「㒼」超過 3 碼，冂內的「人」省去，尾碼＝月（冂）。',
    '急': '包含省略：字首「刍」的最後一橫被框住，省去，字首只取弓；尾碼＝心。',
    '搞': '包含省略：字身「高」超過 3 碼，最後框內的口省去，尾碼＝月（冂）。',
    '侮': '包含省略：字身「每」超過 3 碼，省去被框住的戈，尾碼＝卜。',
    '夠': '包含省略：字首「多」超過 2 碼，省去框內的點（戈），字首＝弓弓；尾碼＝口。',
    '欄': '包含省略：字身「闌」超過 3 碼，柬只取外框「田」作尾碼。',
    '母': '單獨成字只有 3 碼，不用省略：尾碼是「戈」（對比：海、侮的尾碼是卜）。',
    '舟': '單獨成字只有 4 碼，不用省略：尾碼是「戈」（對比：船的字首取竹卜）。',
    # 複合字（永遠只取首尾兩碼）
    '問': '複合字「門」＝日弓；作字首取日，字身口＝尾碼。',
    '們': '複合字「門」作字身，只取日弓：尾碼＝弓。',
    '間': '門＝日弓，字身日：速成 日日。',
    '相': '複合字「目」＝月山：作字身尾碼＝山。',
    '眼': '複合字「目」作字首＝月山；字身「艮」尾碼＝女。',
    '推': '複合字「隹」＝人土：作字身尾碼＝土。',
    '進': '複合字「隹」＝人土：尾碼＝土。',
    '陳': '複合字「阝」＝弓中：作字首取弓；字身「東」尾碼＝田。',
    '隊': '複合字「阝」＝弓中：首碼弓；字身「㒸」尾碼＝人。',
    '塊': '複合字「鬼」＝竹戈：作字身尾碼＝戈。',
    '雞': '複合字「隹」作字身：尾碼＝土。',
    '機': '複合字「幾」＝女戈：作字身尾碼＝戈。',
    # 特殊字：木火大心戈與其他字形重疊時先取它們
    '東': '特殊字：木與田重疊，先取木，再取田 → 木田。',
    '末': '特殊字：木與十重疊，先取木 → 木十。',
    '速': '字身「束」是特殊字：木與口重疊，先取木；尾碼是最後的豎＝中。',
    '拳': '特殊字：上面火與手重疊，先取火 → 火手手。',
    '夷': '特殊字：大與弓重疊，先取大 → 大弓。',
    '屯': '特殊字：心（七形）與山重疊，先取心 → 心山。',
    '秉': '特殊字：木與中重疊，先取木；尾碼＝中。',
    # 特別的字首
    '學': '特別的字首：上面整塊當字首，取竹月；字身子尾碼＝木。',
    '氣': '特別的字首「气」＝人弓；字身米尾碼＝木。',
    '應': '特別的字首「䧹」＝戈土（三代）；字身心＝尾碼。',
    '感': '特別的字首「咸」＝戈口；字身心＝尾碼。',
    '壓': '特別的字首「厭」＝一大；字身土＝尾碼。',
    '歷': '特別的字首「厤」＝一木；字身止尾碼＝一。',
    '養': '特別的字首＝廿人；字身尾碼＝女。',
}


L = []
learned = ''
def add_roots(lid, title, new, tip):
    global learned
    learned += new
    L.append(roots_lesson(lid, title, new, learned, tip))

# ---- 新課序（2026-10-16 老師定）：取碼原則分三段，穿插在字根課之間；難字放在全部字根之後 ----
add_roots(1, '哲理類字根', 'abcdefg', '日月金木水火土住在 A 至 G。')

# 第 2 課：取碼原則（一）只打首尾、取碼次序、單碼字（只用第 1 課的字根）
K2 = learned
singles2 = ''.join(c for c in COMMON[:3000] if len(first[c]) == 1 and idx(c) == 1 and fits(c, K2))
two2 = ''.join(c for c in COMMON[:2500] if fits(c, K2) and len(first[c]) == 2 and c in COLORED)[:40]
L.append(split_lesson(2, '取碼原則（一）', '只打首尾、取碼次序、單碼字', [
    {'title': '速成只打首尾兩碼', 'points': ['倉頡把字拆成幾個字根；速成只打第一個和最後一個', '中間有多少個部件都不理', '紅色是首碼，藍色是尾碼'], 'show': 'keyboard', 'rootLabels': True, 'example': '明'},
    {'title': '單碼字：一個鍵就打到', 'points': ['字本身就是一個字根，例如 日、月、木、水、火', '按一個鍵就可以（打字時只有一個候選字就按空白鍵出字）'], 'show': 'keyboard', 'rootLabels': True, 'example': '木'},
    {'title': '取碼次序', 'points': ['由上至下：昌、炎、圭', '由左至右：明、林、炒', '由外至內：回、同（之後學了田、口就會遇到）', '一個字可以同時用到幾個次序'], 'codes': rule_chars('昌炎林明', K2)},
    {'title': '兩個部件的字', 'points': ['先把字分成兩部分，再按次序取碼', '左邊或上面那部分的第一碼是首碼；右邊或下面那部分的最後一碼是尾碼', '接下來只要拆碼，打對兩個鍵就自動上屏，不用選字']}],
    two2, '按「上至下、左至右」找出第一個和最後一個部件。', keys=K2,
    extra=[{'type': 'drill', 'mode': 'split', 'title': '單碼字', 'chartKeys': K2, 'hint': '這些字本身就是字根：按一個鍵。', 'gen': {'kind': 'chars', 'chars': singles2, 'count': 14}}]))

add_roots(3, '筆畫類字根（上）', 'hijk', '竹戈十大住在 H 至 K，由右手食指和中指負責。')
add_roots(4, '筆畫類字根（下）', 'lmn', '中一弓住在 L、M、N。')

# 第 5 課：取碼原則（二）連體與分體、字首與字身、右上角的點、三個原則（只用第 1–4 課的字根）
K5 = learned
basic5 = ''.join(c for c in COMMON[:1500] if fits(c, K5) and len(Z['cj'].get(c, '')) >= 3 and len(first[c]) == 2)[:50]
r5 = '早白太我求九生字明林鵬翁參式王'
L.append(split_lesson(5, '取碼原則（二）', '連體與分體、字首與字身', [
    {'title': '連體字：整個字連在一起', 'points': ['筆劃交連、不能切開的字（早、白、太、我）', '首碼＝第一個部件，尾碼＝最後一個部件'], 'codes': rule_chars('早白太我', K5)},
    {'title': '分體字：字首和字身', 'points': ['可以切開的字：左、上或外面的部分是「字首」，其餘是「字身」', '速成首碼＝字首的第一碼；尾碼＝字身的最後一碼'], 'codes': rule_chars('明林字', K5)},
    {'title': '字首看位置，不看部首', 'points': ['字首是按次序第一個能切出來的部分，跟部首或字義無關', '以下都是常見的陷阱'], 'codes': rule_chars('鵬翁參', K5)},
    {'title': '右上角的點先取', 'points': ['求、我、式 這類字，右上角的點（戈）是第一碼', '筆順和取碼次序不同時，以取碼次序為準'], 'codes': rule_chars('求我式', K5)},
    {'title': '三個取碼原則', 'points': ['精簡：有幾種拆法時，碼數最少的才對（王＝一土）', '完整：優先取涵蓋筆劃較多的字形（生＝竹手一）', '字形特徵：分割點落在直筆上，不在轉角切，不要把鉤切掉（九＝大弓）'], 'codes': rule_chars('王生九', K5)}],
    basic5 + rule_chars(r5, K5), '自己拆出首碼和尾碼。記住：字首看位置，右上角的點先取。', keys=K5))

add_roots(6, '人體類字根', 'opqr', '人心手口住在 O 至 R。')
add_roots(7, '字形類字根（上）', 'stu', '尸廿山住在 S、T、U。')
add_roots(8, '字形類字根（下）', 'vwy', '女田卜住在 V、W、Y。')

# 第 9 課：取碼原則（三）包含省略、複合字、特殊字、特別的字首（全部字根）
K9 = learned
aux = ''.join(ch for k in SHAPES for sh in SHAPES[k] if sh['shape'] != ROOTS[k] for ch in sh['examples'] if ch in first)
aux = ''.join(dict.fromkeys(aux))
r9 = '雌剪馳疊成戒夫青海船滿急搞侮夠欄問們間相眼推進陳隊塊雞機東末速拳夷屯秉學氣應感壓歷養'
L.append(split_lesson(9, '取碼原則（三）', '包含省略、複合字、特殊字、特別字首', [
    {'title': '先溫習：字首和原則', 'points': ['字首看位置（雌、剪、馳、疊）；右上角的點先取（成、戒）', '完整原則：夫＝手人、青＝手一月'], 'codes': rule_chars('雌剪馳疊成戒夫青', K9)},
    {'title': '包含省略：被框住的部件不算', 'points': ['字首超過 2 碼或字身超過 3 碼時，最後一個部件如果被三面或四面包住，就省去它，取外框作尾碼', '外框有 囗 冂 コ 匚 廿 几 乃 凵 ク', '同一個部件單獨成字時碼數不超限，就不用省略（母 田卜戈，但 海 水人田卜）'], 'codes': rule_chars('海船滿急搞母', K9)},
    {'title': '複合字：永遠只取首尾兩碼', 'points': ['門＝日弓、目＝月山、隹＝人土、阝＝弓中、鬼＝竹戈、鬥＝中弓、幾＝女戈、虍＝卜心', '作字身時，速成尾碼就是複合字的尾碼'], 'codes': rule_chars('問們相推進陳塊', K9)},
    {'title': '特殊字：重疊的先取木火大心戈', 'points': ['木、火、大、心（七形）、戈 與其他字形重疊時，先取它們，再取疊在上面的字形'], 'codes': rule_chars('東末拳夷屯', K9)},
    {'title': '特別的字首', 'points': ['有些字的上半部整塊當字首，取它的首尾兩碼', '學＝竹月、氣＝人弓、應＝戈土、感＝戈口、壓＝一大'], 'codes': rule_chars('學氣應感壓', K9)}],
    aux + rule_chars(r9, K9), '先認出部件，再想它屬哪個鍵；留意包含省略和複合字的尾碼。', keys=K9))

# 第 10 課：難字 X 與總複習
learned += 'x'
X_TYPES = [('齊類：卜＋難', '齊濟擠臍', '齊 的上面是「亠」（卜），下面難拆的部分用 X 代替'),
           ('肅類：中＋難', '肅蕭繡簫嘯', '肅 的上面是聿字頭（中），下面的「淵」形用 X 代替'),
           ('臼類：竹＋難', '臼舀滔稻插陷舊', '臼 的第一撇是竹，其餘用 X 代替；舀、滔、稻、插、陷、舊 都有 臼'),
           ('卍：弓＋難', '卍', '卍 只有第一筆像弓，其餘用 X 代替')]
xchars = ''.join(c for _, cs, _ in X_TYPES for c in cs if c in first)
l10 = roots_lesson(10, '難字與總複習', 'x', learned, '難字鍵 X 代替難拆的部分。')
l10['subtitle'] = '難 X（齊、肅、滔、卍）＋ 全部字根'
del l10['steps'][0]   # 本課就是總複習，不另加「複習前課」
l10['steps'][0]['text'] = 'xxx'
l10['steps'][1]['text'] = 'xxxxxx'
l10['steps'][2] = guide('難字 X', [{'title': t, 'points': [pt, '速成：首碼照常取，尾碼按 X'], 'codes': cs} for t, cs, pt in X_TYPES] +
    [{'title': '全部字根和輔助字形', 'points': ['24 個字根，加難字鍵 X', '下面是全部輔助字形，不記得的可以回到字根課重溫'], 'shapes': 'abcdefghijklmnopqrstuvwy'}])
l10['steps'].insert(3, {'type': 'drill', 'mode': 'split', 'colored': True, 'chartKeys': ALL, 'title': '難字拆字', 'hint': '這些字的尾碼都是 X（難）：紅色是首碼，藍色是 X 代替的部分。', 'gen': {'kind': 'chars', 'chars': xchars, 'count': 14}})
l10['steps'][4]['gen']['keys'] = ALL.replace('x', '')
l10['steps'][4]['hint'] = '全部輔助字形隨機出現：看字形，按鍵。'
for i in (5, 6):
    l10['steps'][i]['chartKeys'] = ALL
l10['steps'][5]['gen']['chars'] = pool(ALL, ALL, maxidx=99, top=3000, n=120, colored=True, two=True)
l10['steps'][6]['gen']['chars'] = pool(ALL, ALL, maxidx=99, top=3000, n=200, colored=True, two=True)[60:]
l10['steps'][7]['gen']['chars'] = ''.join(c for c in xchars if idx(c) <= 9) + quiz_pool(ALL, ALL, n_new=50, n_review=0)
l10['newKeys'] = ['KeyX']
L.append(l10)

# 第 11 課：選字與標點
pick_chars = ''.join(c for c in COMMON[:800] if 2 <= idx(c) <= 9)[:40]
punct_texts = ['你好，我是中一學生。', '今天上甚麼課？', '加油！我們一起努力。', '老師說：「準確比快更重要。」', '我喜歡中文、英文和數學。']
for t in punct_texts:
    for c in t:
        assert c in PUNCT or c in first, c
L.append({'id': 11, 'title': '選字與標點', 'subtitle': '數字鍵揀字、中文標點', 'pass': {'accuracy': 90},
    'newKeys': keycodes(ALL) + ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Comma', 'Period', 'Slash', 'Semicolon', 'BracketLeft', 'BracketRight', 'Backslash', 'ShiftLeft', 'ShiftRight'],
    'steps': [
        guide('選字與標點', [
            {'title': '同一組碼，很多個字', 'points': ['速成只有兩碼，很多字共用同一組碼', '打完碼後，看選字窗，按字旁邊的數字 1 至 9 揀字', '要找的字不在這一頁時，按空白鍵翻到下一頁', '只有一個候選字（例如 一、心、月）時，按空白鍵直接出字'], 'show': 'keyboard', 'rootLabels': True, 'imeDemo': '校'},
            {'title': '中文標點', 'points': ['逗號「，」按 ,　句號「。」按 .　頓號「、」按 \\', '問號「？」按 Shift＋/　感嘆號「！」按 Shift＋1', '冒號「：」按 Shift＋;　引號「」按 [ 和 ]', '要先把字上屏，組字框空着才可以打標點'], 'show': 'keyboard',
             'highlight': ['Comma', 'Period', 'Backslash', 'Slash', 'Digit1', 'Semicolon', 'BracketLeft', 'BracketRight']}]),
        {'type': 'drill', 'mode': 'quick', 'title': '揀字', 'hint': '這些字都不是第 1 個候選字：打完碼，看清楚再按數字。', 'gen': {'kind': 'chars', 'chars': pick_chars, 'count': 20}},
        {'type': 'drill', 'mode': 'quick', 'title': '標點（一）', 'hint': '留意每句的標點。', 'text': ''.join(punct_texts[:2])},
        {'type': 'drill', 'mode': 'quick', 'title': '標點（二）', 'hint': '留意每句的標點。', 'text': ''.join(punct_texts[2:4])},
        {'type': 'test', 'mode': 'quick', 'title': '過關小測', 'timeLimit': 90, 'pass': {'accuracy': 90},
         'hint': '把整句打出來，包括標點。準確率達 90% 即過關。', 'text': ''.join(punct_texts)}]})

# 第 12、13 課：常用字，每 50 字一批，逐批打熟（每批不重複出齊 50 字），最後小測
def batch_lesson(lid, title, subtitle, start, end, test_pass, test_count):
    steps = []
    for b in range(start, end, 50):
        chars = COMMON[b:b + 50]
        steps.append({'type': 'drill', 'mode': 'quick', 'title': f'第 {b + 1}–{b + 50} 字',
                      'hint': f'常用字第 {b + 1} 至 {b + 50}：這 50 個字每個出一次。不記得碼時，看提示；要翻頁的字按空白鍵。',
                      'gen': {'kind': 'chars', 'chars': chars, 'count': 50, 'unique': True}})
    steps.append({'type': 'test', 'mode': 'quick', 'title': '過關小測', 'timeLimit': 90, 'pass': test_pass,
                  'hint': f'90 秒內打得愈多愈好，字從第 {start + 1} 至 {end} 字抽出。{pass_text(test_pass)}',
                  'gen': {'kind': 'chars', 'chars': COMMON[start:end], 'count': test_count}})
    return {'id': lid, 'title': title, 'subtitle': subtitle, 'newKeys': [], 'pass': test_pass, 'steps': steps}

L.append(batch_lesson(12, '常用字（一）', '最常用 500 字，分 10 批', 0, 500, {'wpm': 3, 'accuracy': 90}, 120))
L.append(batch_lesson(13, '常用字（二）', '第 501 至 1000 字，分 10 批', 500, 1000, {'wpm': 5, 'accuracy': 90}, 150))

# 第 14 課：詞語（原創的香港常用兩字詞，用頓號分隔；部分字要翻頁，例如「學」）
WORDS = """學校 老師 同學 課室 功課 考試 上課 下課 放學 早餐 午餐 晚餐 朋友 家人 爸爸 媽媽 哥哥 姐姐 弟弟 妹妹
電腦 鍵盤 手機 中文 英文 數學 科學 歷史 地理 音樂 體育 美術 電車 地鐵 巴士 天氣 太陽 月亮 星星 下雨
春天 夏天 秋天 冬天 今天 明天 昨天 時間 星期 早上 晚上 中午 香港 九龍 新界 海港 山頂 公園 運動 跑步
游泳 足球 籃球 比賽 練習 速度 準確 打字 中國 世界 城市 地方 生活 學習 工作 健康 快樂 開心 努力 認真
小心 安全 環境 地球 動物 植物 花園 水果 牛奶 麵包 米飯 點心 生日 禮物 電影 故事 新聞 問題 答案 方法
意見 計劃 目標 夢想 未來 希望 感謝 幫助 分享 合作 校服 書包 午飯 假期 旅行 海灘 回家 休息 睡覺 起床""".split()
words = [w for w in WORDS if all(c in first for c in w)]
dropped = [w for w in WORDS if w not in words]
print('詞語', len(words), '個；碼表沒有而不收：', ' '.join(dropped))
import random
rnd = random.Random(2027)
def word_text(k):
    return '、'.join(rnd.sample(words, k)) + '。'
L.append(text_lesson(14, '詞語', '常用兩字詞', [word_text(8), word_text(8), word_text(10), word_text(30)],
    '詞語之間用頓號「、」分隔（按 \\ 鍵）。要翻頁的字按空白鍵。', {'wpm': 6, 'accuracy': 90}, unit='組'))

# 第 15 課：句子與短文（原創）
sentences = [
    '今天天氣很好，我們一起去公園跑步。',
    '上課的時候，請大家專心聽老師講解。',
    '放學後，我和同學在圖書館做功課。',
    '你知道明天的考試在甚麼時間開始嗎？',
    '香港是一個國際城市，每天都有很多人來旅行。這裏的交通十分方便，乘坐地鐵和巴士可以到達不同的地方。',
    '學習打字需要耐心。開始時速度會比較慢，但只要每天練習十分鐘，手指就會慢慢記住每個字根的位置。先求準確，再求速度，你一定可以做到！',
]
L.append(text_lesson(15, '句子與短文', '把整段話打出來', sentences,
    '連標點一起打。不記得碼時，看提示。', {'wpm': 6, 'accuracy': 90}, limit=120))

# 檢查：所有字都在碼表
for l in L:
    for s in l['steps']:
        t = s.get('text') or s.get('gen', {}).get('chars') or ''
        for c in t:
            assert c in PUNCT or c in first or s.get('mode') == 'roots', (l['id'], c)

data = json.load(open('data/zh-lessons.json', encoding='utf-8'))
data['lessons'] = data['lessons'][:1] + L
data['notes'] = NOTES
json.dump(data, open('data/zh-lessons.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('共', len(data['lessons']), '課')
for l in L:
    print(l['id'], l['title'], '|', ' / '.join(s['title'] for s in l['steps']))
