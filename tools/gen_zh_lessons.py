#!/usr/bin/env python3
"""產生中文速成第 2–15 課，併入 data/zh-lessons.json（第 0、1 課保持不變）。
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
        if 2 <= i <= 9:
            ks.add(f'Digit{i}')
    return sorted(ks)

def keycodes(letters):
    return [f'Key{k.upper()}' for k in letters]

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
            {'type': 'drill', 'mode': 'roots', 'title': '組合',
             'hint': '新字根和學過的字根一起出現。', 'gen': {'kind': 'roots', 'keys': weighted, 'count': 45}},
            {'type': 'drill', 'mode': 'quick', 'title': '打字',
             'hint': '這些字只用學過的字根就打到。跟着選字窗的提示揀字。',
             'gen': {'kind': 'chars', 'chars': chars, 'count': 20}},
            {'type': 'test', 'mode': 'roots', 'title': '過關小測',
             'hint': '45 秒內看字根按鍵，鍵盤不會顯示字根。準確率達 90% 即過關。',
             'timeLimit': 45, 'pass': {'accuracy': 90},
             'gen': {'kind': 'roots', 'keys': weighted, 'count': 90}},
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
    return {'id': lid, 'title': title, 'subtitle': subtitle, 'newKeys': keycodes(allk) + code_keys(chars),
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
    return {'id': lid, 'title': title, 'subtitle': subtitle, 'newKeys': keycodes(allk), 'pass': test_pass, 'steps': steps}

def guide(title, slides):
    return {'type': 'guide', 'title': title, 'slides': slides}

L = []
learned = 'abcdefg'
for lid, title, new, tip in [
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
l7['steps'][2]['gen']['keys'] = 'abcdefghijklmnopqrstuvwyx'
l7['steps'][3]['gen']['chars'] = x_chars
l7['steps'][4]['gen']['keys'] = 'abcdefghijklmnopqrstuvwyx'
l7['newKeys'] = keycodes('abcdefghijklmnopqrstuvwyx') + code_keys(x_chars)
L.append(l7)

# 第 8 課：單碼字
singles = ''.join(c for c in COMMON[:3000] if len(first[c]) == 1 and idx(c) == 1)
L.append(quick_lesson(8, '單碼字', '一個碼就打到的字', singles,
    '這些字只有一個字根：按一個鍵，再按空白鍵。', {'accuracy': 90},
    guide('單碼字', [{'title': '一個鍵就打到的字', 'points': [
        '有些字本身就是一個字根，例如 日、月、木、口、人',
        '這些字只要按一個鍵，再按空白鍵上屏',
        '它們是最常用的字，熟練後可以打得很快'], 'show': 'keyboard', 'rootLabels': True, 'example': '人'}])))

# 第 9 課：拆字規則（首尾碼）
split_chars = ''.join(c for c in COMMON[:400] if len(first[c]) == 2 and idx(c) == 1 and len(Z['cj'].get(c, '')) >= 3)[:40]
L.append(quick_lesson(9, '拆字規則', '只打首碼和尾碼', split_chars,
    '提示會列出倉頡全碼：只打第一個和最後一個字根。', {'accuracy': 90},
    guide('拆字規則', [
        {'title': '先拆字，再取首尾', 'points': [
            '左右結構：先左後右，例如 林 ＝ 木＋木',
            '上下結構：先上後下，例如 想 ＝ 木…心',
            '外內結構：先外後內，例如 國 ＝ 田…一',
            '速成只取第一個和最後一個字根，中間的不用打'], 'show': 'keyboard', 'rootLabels': True, 'example': '校'},
        {'title': '再看一個例子', 'points': [
            '「電」的倉頡碼是 一 月 田 山',
            '速成只打 一（M）和 山（U）',
            '不肯定時，可以用「速成查碼」查一查'], 'show': 'keyboard', 'rootLabels': True, 'example': '電'}])))

# 第 10 課：同碼字選字
pick_chars = ''.join(c for c in COMMON[:800] if 2 <= idx(c) <= 9)[:40]
L.append(quick_lesson(10, '同碼字選字', '用數字鍵揀字', pick_chars,
    '這些字都不是第 1 個候選字：打完碼，看清楚再按數字。', {'accuracy': 90},
    guide('同碼字', [{'title': '同一組碼，很多個字', 'points': [
        '速成只有兩碼，所以很多字共用同一組碼',
        '選字窗按次序列出候選字：第 1 個按空白鍵，其餘按數字',
        '常用字的位置是固定的，多打幾次就會記得',
        '眼睛看選字窗，手指不用離開基準位太遠'], 'show': 'keyboard', 'rootLabels': True, 'imeDemo': '校'}])))

# 第 11 課：中文標點
punct_texts = ['你好，我是中一學生。', '今天上甚麼課？', '加油！我們一起努力。', '老師說：「準確比快更重要。」', '我喜歡中文、英文和數學。']
for t in punct_texts:
    for c in t:
        assert c in PUNCT or c in first, c
l11 = {'id': 11, 'title': '中文標點', 'subtitle': '，。、？！「」：', 'pass': {'accuracy': 90},
       'newKeys': ['Comma', 'Period', 'Semicolon', 'Slash', 'Digit1', 'BracketLeft', 'BracketRight', 'Backslash', 'ShiftLeft', 'ShiftRight'],
       'steps': [guide('中文標點', [{'title': '組字框空着時按標點鍵', 'points': [
           '逗號「，」按 ,　句號「。」按 .　頓號「、」按 \\',
           '問號「？」按 Shift＋/　感嘆號「！」按 Shift＋1',
           '冒號「：」按 Shift＋;　引號「」按 [ 和 ]',
           '要先把字上屏，組字框空着才可以打標點'], 'show': 'keyboard',
           'highlight': ['Comma', 'Period', 'Backslash', 'Slash', 'Digit1', 'Semicolon', 'BracketLeft', 'BracketRight']}])]}
for i, t in enumerate(punct_texts[:-1]):
    l11['steps'].append({'type': 'drill', 'mode': 'quick', 'title': f'第 {i + 1} 句', 'hint': '留意每句的標點。', 'text': t})
l11['steps'].append({'type': 'test', 'mode': 'quick', 'title': '過關小測', 'timeLimit': 90, 'pass': {'accuracy': 90},
                     'hint': '把整句打出來，包括標點。準確率達 90% 即過關。', 'text': ''.join(punct_texts)})
L.append(l11)

# 第 12、13 課：常用字
L.append(quick_lesson(12, '常用字（一）', '最常用 300 字', COMMON[:300],
    '最常用的 300 字。有些字要按 PageDown 翻頁才找到，例如「學」。', {'wpm': 3}, count=30, test_count=120))
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
    '詞語之間用頓號「、」分隔（按 \\ 鍵）。要翻頁的字按 PageDown。', {'wpm': 6, 'accuracy': 90}, unit='組'))

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
data['lessons'] = data['lessons'][:2] + L
json.dump(data, open('data/zh-lessons.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('共', len(data['lessons']), '課')
for l in L:
    print(l['id'], l['title'], '|', ' / '.join(s['title'] for s in l['steps']))
