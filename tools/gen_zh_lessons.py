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
COLORED = set(chr(int(f[:-5], 16)) for f in os.listdir('assets/glyphs') if f.endswith('.json'))

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
    chars = pool(learned, new)
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


L = []
learned = ''
for lid, title, new, tip in [
    (1, '哲理類字根', 'abcdefg', '日月金木水火土住在 A 至 G。'),
    (2, '筆畫類字根（上）', 'hijk', '竹戈十大住在 H 至 K，由右手食指和中指負責。'),
    (3, '筆畫類字根（下）', 'lmn', '中一弓住在 L、M、N。'),
    (4, '人體類字根', 'opqr', '人心手口住在 O 至 R。'),
    (5, '字形類字根（上）', 'stu', '尸廿山住在 S、T、U。'),
    (6, '字形類字根（下）', 'vwy', '女田卜住在 V、W、Y。'),
]:
    learned += new
    L.append(roots_lesson(lid, title, new, learned, tip))

# 第 7 課：難字鍵 X 與全部字根複習
learned += 'x'
x_chars = pool(learned, 'x', 5, 3000, 10) + pool(learned, learned, 3, 300, 20)
l7 = roots_lesson(7, '難字鍵與總複習', 'x', learned, '難字鍵 X 用於難以拆分的部分，例如「齊」「舊」。')
l7['subtitle'] = '難 X ＋ 全部字根'
del l7['steps'][0]   # 第 7 課本身就是總複習，不另加「複習前課」
ALL = 'abcdefghijklmnopqrstuvwyx'
l7['steps'][0]['text'] = 'xxx'
l7['steps'][1]['text'] = 'xxxxxx'
l7['steps'][2] = guide('總複習', [{'title': '全部字根和輔助字形', 'points': ['24 個字根，加難字鍵 X', '下面是全部輔助字形，不記得的可以回到第 1 至 6 課重溫'], 'shapes': 'abcdefghijklmnopqrstuvwy'}])
l7['steps'][3]['gen']['keys'] = ALL.replace('x', '')
l7['steps'][3]['hint'] = '全部輔助字形隨機出現：看字形，按鍵。'
for i in (4, 5):
    l7['steps'][i]['chartKeys'] = ALL
l7['steps'][4]['gen']['chars'] = pool(ALL, ALL, maxidx=99, top=3000, n=120, colored=True, two=True)
l7['steps'][5]['gen']['chars'] = pool(ALL, ALL, maxidx=99, top=3000, n=200, colored=True, two=True)[60:]
l7['steps'][6]['gen']['chars'] = x_chars + pool(ALL, ALL, 5, 1000, 40)
l7['newKeys'] = []
L.append(l7)

def split_lesson(lid, title, subtitle, slides, chars, hint, test_pass={'accuracy': 90}, n=20):
    chars = ''.join(dict.fromkeys(chars))
    return {'id': lid, 'title': title, 'subtitle': subtitle, 'newKeys': keycodes(ALL), 'pass': test_pass,
            'steps': [guide(title, slides),
                      {'type': 'drill', 'mode': 'split', 'colored': True, 'title': '看顏色拆字', 'hint': '紅色部件是首碼，藍色部件是尾碼。', 'gen': {'kind': 'chars', 'chars': ''.join(c for c in chars if c in COLORED) or chars, 'count': n}},
                      {'type': 'drill', 'mode': 'split', 'hints': 'less', 'chartKeys': ALL, 'title': '自行拆字', 'hint': hint + ' 打錯要改正才可繼續。', 'gen': {'kind': 'chars', 'chars': chars, 'count': n, 'unique': True}},
                      {'type': 'test', 'mode': 'split', 'title': '過關小測', 'timeLimit': 60, 'pass': test_pass, 'chartKeys': ALL,
                       'hint': f'60 秒內自行拆字，沒有提示，可參考字根表。{pass_text(test_pass)}', 'gen': {'kind': 'chars', 'chars': chars, 'count': 80}}]}

# 第 8 課：單碼字與取碼次序
singles = ''.join(c for c in COMMON[:3000] if len(first[c]) == 1 and idx(c) == 1)
two = ''.join(c for c in COMMON[:800] if len(Z['cj'].get(c, '')) == 2)[:30]
L.append({'id': 8, 'title': '單碼字與取碼次序', 'subtitle': '上至下、左至右、外至內', 'newKeys': keycodes(ALL), 'pass': {'accuracy': 90},
    'steps': [
        guide('取碼次序', [
            {'title': '一個鍵就打到的字', 'points': ['字本身就是一個字根，例如 日、月、木、口、人', '按一個鍵就可以'], 'show': 'keyboard', 'rootLabels': True, 'example': '人'},
            {'title': '取碼的次序', 'points': ['由上至下：例如 昌 ＝ 日（上）…日（下）', '由左至右：例如 林 ＝ 木（左）…木（右）', '由外至內：例如 回 ＝ 田字框（外）…口（內）', '一個字可以同時用到幾個次序'], 'show': 'keyboard', 'rootLabels': True, 'example': '回'},
            {'title': '兩個部件的字', 'points': ['先把字分成兩部分，再按次序取碼', '明 ＝ 日＋月，林 ＝ 木＋木，吉 ＝ 士＋口', '接下來只要拆碼，打對兩個鍵就自動上屏，不用選字'], 'show': 'keyboard', 'rootLabels': True, 'example': '吉'}]),
        {'type': 'drill', 'mode': 'split', 'title': '單碼字', 'hint': '這些字本身就是字根：按一個鍵。', 'gen': {'kind': 'chars', 'chars': singles, 'count': 16}},
        {'type': 'drill', 'mode': 'split', 'title': '兩個部件', 'hint': '每個字由兩個字根組成：按次序打兩個鍵。', 'gen': {'kind': 'chars', 'chars': two, 'count': 20}},
        {'type': 'test', 'mode': 'split', 'title': '過關小測', 'timeLimit': 60, 'pass': {'accuracy': 90},
         'hint': '60 秒內拆得愈多愈好，沒有提示。準確率達 90% 即過關。', 'gen': {'kind': 'chars', 'chars': singles + two, 'count': 80}}]})

# 拆碼說明（按 docs/cangjie-rules.md；顯示在規則卡、拆字答案和「上一題」）
NOTES = {
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

def rule_chars(keys):
    return ''.join(c for c in keys if c in first)

# 第 9 課：拆字（一）：字首字身、次序、原則
basic = ''.join(c for c in COMMON[:700] if len(Z['cj'].get(c, '')) >= 3 and len(first[c]) == 2)[:60]
l9_rule = rule_chars('鵬雌翁剪馳參疊求我成式戒王夫九青生')
L.append(split_lesson(9, '拆字（一）', '字首、字身與取碼次序', [
    {'title': '中間的部件不用打', 'points': ['按「上至下、左至右、外至內」把字拆開', '速成只取第一個和最後一個部件，中間有多少個都不理', '分體字：字首（左、上或外）的第一個部件是首碼；字身的最後一個部件是尾碼'], 'show': 'keyboard', 'rootLabels': True, 'example': '校'},
    {'title': '字首看位置，不看部首', 'points': ['字首是按次序第一個能切出來的部分，跟部首或字義無關', '以下都是常見的陷阱'], 'codes': rule_chars('鵬雌翁剪馳參疊')},
    {'title': '右上角的點先取', 'points': ['戈、成、我、式 這類字，右上角的點是第一碼', '筆順和取碼次序不同時，以取碼次序為準'], 'codes': rule_chars('求我成式戒')},
    {'title': '三個取碼原則', 'points': ['精簡：有幾種拆法時，碼數最少的才對', '完整：優先取涵蓋筆劃較多的字形', '字形特徵：分割點落在直筆上，不要把鉤切掉'], 'codes': rule_chars('王夫九青生')}],
    basic + l9_rule, '自己拆出首碼和尾碼。記住：字首看位置，右上角的點先取。'))

# 第 10 課：拆字（二）：輔助字形與尾碼陷阱
aux = ''.join(ch for k in SHAPES for sh in SHAPES[k] if sh['shape'] != ROOTS[k] for ch in sh['examples'] if ch in first)
aux = ''.join(dict.fromkeys(aux))
l10_rule = rule_chars('海船滿急搞侮夠欄問們間相眼推進陳隊塊雞機東末速拳夷屯秉學氣應感壓歷養')
L.append(split_lesson(10, '拆字（二）', '輔助字形與尾碼陷阱', [
    {'title': '部件不像字根？查輔助字形', 'points': ['很多部件是字根的變形：氵 水、扌 手、亻 人、忄 心、宀 十、辶 卜、艹 廿', '冂 冖 爫 都是月，囗 是田，幺 是女，灬 是火', '不認識的部件，開「速成查碼」查一查'], 'shapes': 'eqopjytbwvf'},
    {'title': '包含省略：被框住的部件不算', 'points': ['字首超過 2 碼或字身超過 3 碼時，最後一個部件如果被三面或四面包住，就省去它，取外框作尾碼', '外框有 囗 冂 コ 匚 廿 几 乃 凵 ク', '同一個部件單獨成字時碼數不超限，就不用省略（母 田卜戈，但 海 水人田卜）'], 'codes': rule_chars('海船滿急搞母')},
    {'title': '複合字：永遠只取首尾兩碼', 'points': ['門＝日弓、目＝月山、隹＝人土、阝＝弓中、鬼＝竹戈、鬥＝中弓、幾＝女戈、虍＝卜心', '作字身時，速成尾碼就是複合字的尾碼'], 'codes': rule_chars('問們相推進陳塊')},
    {'title': '特殊字：重疊的先取木火大心戈', 'points': ['木、火、大、心（七形）、戈 與其他字形重疊時，先取它們，再取疊在上面的字形'], 'codes': rule_chars('東末拳夷屯')},
    {'title': '特別的字首', 'points': ['有些字的上半部整塊當字首，取它的首尾兩碼', '學＝竹月、氣＝人弓、應＝戈土、感＝戈口、壓＝一大'], 'codes': rule_chars('學氣應感壓')}],
    aux + l10_rule, '先認出部件，再想它屬哪個鍵；留意包含省略和複合字的尾碼。'))

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
            {'title': '同一組碼，很多個字', 'points': ['速成只有兩碼，很多字共用同一組碼', '打完碼後，看選字窗，按字旁邊的數字 1 至 9 揀字', '要找的字不在這一頁時，按空白鍵翻到下一頁'], 'show': 'keyboard', 'rootLabels': True, 'imeDemo': '校'},
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
