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

def idx(ch):
    q = first[ch]
    return Z['quick'][q].index(ch) + 1

def pool(keys, need, maxidx=5, top=2500, n=30):
    out = []
    for ch in COMMON[:top]:
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
    groups = [keys[i:i + 4] for i in range(0, len(keys), 4)]
    out = []
    for g in groups:
        out.append({'title': '輔助字形：' + '、'.join(ROOTS[k] for k in g),
                    'points': ['同一個字根鍵，在不同的字裏會變成不同樣子（輔助字形）',
                               '看到這些部件，都按同一個鍵',
                               '注意：部件不等於單獨的字，例如「又」作部件屬 水 E，但單獨打「又」字是 N E'],
                    'shapes': g})
    return out

def roots_lesson(lid, title, new, learned, extra_hint):
    chars = pool(learned, new)
    names = ' '.join(ROOTS[k] for k in new)
    weighted = learned + new * 3
    return {
        'id': lid, 'title': title, 'subtitle': names,
        'newKeys': keycodes(new) + code_keys(chars),
        'pass': {'accuracy': 90},
        'steps': [
            {'type': 'drill', 'mode': 'roots', 'title': '示範', 'display': 'big',
             'hint': f'{names}：{extra_hint}看字根，按對應的鍵。', 'text': new * 2},
            {'type': 'drill', 'mode': 'roots', 'title': '單鍵',
             'hint': '每個字根三次，記住它的位置。', 'text': ''.join(k * 3 for k in new) * 3},
            guide('輔助字形', shape_slides(new)),
            {'type': 'drill', 'mode': 'shapes', 'title': '認字形',
             'hint': '字根和它的輔助字形會隨機出現：看到哪個部件，就按它所屬的鍵。', 'gen': {'kind': 'shapes', 'keys': new, 'count': 30}},
            {'type': 'drill', 'mode': 'shapes', 'title': '組合',
             'hint': '新學和學過的字根、輔助字形一起出現。', 'gen': {'kind': 'shapes', 'keys': weighted, 'count': 45}},
            {'type': 'drill', 'mode': 'quick', 'title': '打字',
             'hint': '這些字只用學過的字根就打到。跟着選字窗的提示揀字。',
             'gen': {'kind': 'chars', 'chars': chars, 'count': 20}},
            {'type': 'test', 'mode': 'shapes', 'title': '過關小測',
             'hint': '45 秒內看字根或輔助字形按鍵，鍵盤不會顯示字根。準確率達 90% 即過關。',
             'timeLimit': 45, 'pass': {'accuracy': 90},
             'gen': {'kind': 'shapes', 'keys': weighted, 'count': 90}},
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
l7['steps'][0]['text'] = 'xxx'
l7['steps'][1]['text'] = 'xxxxxx'
ALL = 'abcdefghijklmnopqrstuvwyx'
l7['steps'][2] = guide('總複習', shape_slides('abcdefg') + shape_slides('hijklmn') + shape_slides('opqrstuvwy'))
l7['steps'][3]['gen']['keys'] = ALL
l7['steps'][3]['hint'] = '全部字根和輔助字形隨機出現。'
l7['steps'][4]['gen']['keys'] = ALL
l7['steps'][5]['gen']['chars'] = x_chars
l7['steps'][6]['gen']['keys'] = ALL
l7['newKeys'] = keycodes('abcdefghijklmnopqrstuvwyx') + code_keys(x_chars)
L.append(l7)

def split_lesson(lid, title, subtitle, slides, chars, hint, test_pass={'accuracy': 85}, n=20):
    return {'id': lid, 'title': title, 'subtitle': subtitle, 'newKeys': keycodes(ALL), 'pass': test_pass,
            'steps': [guide(title, slides),
                      {'type': 'drill', 'mode': 'split', 'title': '拆字練習', 'hint': hint, 'gen': {'kind': 'chars', 'chars': chars, 'count': n}},
                      {'type': 'drill', 'mode': 'split', 'title': '再拆一次', 'hint': hint, 'gen': {'kind': 'chars', 'chars': chars, 'count': n}},
                      {'type': 'test', 'mode': 'split', 'title': '過關小測', 'timeLimit': 60, 'pass': test_pass,
                       'hint': f'60 秒內拆得愈多愈好，沒有提示。{pass_text(test_pass)}', 'gen': {'kind': 'chars', 'chars': chars, 'count': 80}}]}

# 第 8 課：單碼字與取碼次序
singles = ''.join(c for c in COMMON[:3000] if len(first[c]) == 1 and idx(c) == 1)
two = ''.join(c for c in COMMON[:800] if len(Z['cj'].get(c, '')) == 2)[:30]
L.append({'id': 8, 'title': '單碼字與取碼次序', 'subtitle': '上至下、左至右、外至內', 'newKeys': keycodes(ALL), 'pass': {'accuracy': 85},
    'steps': [
        guide('取碼次序', [
            {'title': '一個鍵就打到的字', 'points': ['字本身就是一個字根，例如 日、月、木、口、人', '按一個鍵就可以'], 'show': 'keyboard', 'rootLabels': True, 'example': '人'},
            {'title': '取碼的次序', 'points': ['由上至下：例如 昌 ＝ 日（上）…日（下）', '由左至右：例如 林 ＝ 木（左）…木（右）', '由外至內：例如 回 ＝ 田字框（外）…口（內）', '一個字可以同時用到幾個次序'], 'show': 'keyboard', 'rootLabels': True, 'example': '回'},
            {'title': '兩個部件的字', 'points': ['先把字分成兩部分，再按次序取碼', '明 ＝ 日＋月，林 ＝ 木＋木，吉 ＝ 士＋口', '接下來只要拆碼，打對兩個鍵就自動上屏，不用選字'], 'show': 'keyboard', 'rootLabels': True, 'example': '吉'}]),
        {'type': 'drill', 'mode': 'split', 'title': '單碼字', 'hint': '這些字本身就是字根：按一個鍵。', 'gen': {'kind': 'chars', 'chars': singles, 'count': 16}},
        {'type': 'drill', 'mode': 'split', 'title': '兩個部件', 'hint': '每個字由兩個字根組成：按次序打兩個鍵。', 'gen': {'kind': 'chars', 'chars': two, 'count': 20}},
        {'type': 'test', 'mode': 'split', 'title': '過關小測', 'timeLimit': 60, 'pass': {'accuracy': 85},
         'hint': '60 秒內拆得愈多愈好，沒有提示。準確率達 85% 即過關。', 'gen': {'kind': 'chars', 'chars': singles + two, 'count': 80}}]})

# 第 9 課：拆字（一）：只用基本字根
basic = ''.join(c for c in COMMON[:700] if len(Z['cj'].get(c, '')) >= 3 and len(first[c]) == 2)[:60]
L.append(split_lesson(9, '拆字（一）', '只取首尾，中間不理', [
    {'title': '中間的部件不用打', 'points': ['先按次序把整個字拆開', '速成只取第一個和最後一個部件', '中間有多少個部件都不用理會'], 'show': 'keyboard', 'rootLabels': True, 'example': '校'},
    {'title': '再看兩個例子', 'points': ['電 ＝ 一 月 田 山 → 一（M）＋ 山（U）', '學 ＝ 竹 月 弓 木 → 竹（H）＋ 木（D）', '打錯一次會提示倉頡拆法，打錯兩次會顯示答案'], 'show': 'keyboard', 'rootLabels': True, 'example': '學'}],
    basic, '自己拆出首碼和尾碼。打錯一次有提示，打錯兩次會顯示答案。'))

# 第 10 課：拆字（二）：輔助字形
aux = ''.join(ch for k in SHAPES for sh in SHAPES[k] if sh['shape'] != ROOTS[k] for ch in sh['examples'] if ch in first)
aux = ''.join(dict.fromkeys(aux))
L.append(split_lesson(10, '拆字（二）', '找出輔助字形', [
    {'title': '部件不像字根？查輔助字形', 'points': ['很多部件是字根的變形，例如 氵 是水、扌 是手、亻 是人', '拆字時先認出部件，再想它屬哪個字根鍵', '下面是最常見的輔助字形'], 'shapes': 'eqoptj'},
    {'title': '更多常見輔助字形', 'points': ['辶 走字底是 卜（Y），艹 草花頭是 廿（T）', '冂 同字框是 月（B），囗 大口框是 田（W）', '幺 絲字邊是 女（V），灬 四點火是 火（F）'], 'shapes': 'ybwvfi'},
    {'title': '遇到不認識的部件', 'points': ['先打開「速成查碼」查一查，看它屬哪個鍵', '查碼頁底部有完整的字根和輔助字形表', '多拆幾次，常見的部件很快就會記住'], 'shapes': 'kmns'}],
    aux, '這些字都有輔助字形：先認出部件，再想它屬哪個鍵。'))

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

# 第 12、13 課：常用字
L.append(quick_lesson(12, '常用字（一）', '最常用 300 字', COMMON[:300],
    '最常用的 300 字。有些字要按空白鍵翻頁才找到，例如「學」在第 3 頁。', {'wpm': 3}, count=30, test_count=120))
L.append(quick_lesson(13, '常用字（二）', '第 301 至 1000 字', COMMON[300:1000],
    '再多 700 個常用字。不記得碼時，看提示。', {'wpm': 5}, count=30, test_count=150))

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
json.dump(data, open('data/zh-lessons.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('共', len(data['lessons']), '課')
for l in L:
    print(l['id'], l['title'], '|', ' / '.join(s['title'] for s in l['steps']))
