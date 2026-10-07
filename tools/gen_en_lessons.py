#!/usr/bin/env python3
"""產生英文第 2–16 課，並併入 data/en-lessons.json（第 0、1 課保持不變）。
詞表：google-10000-english（教育用途，見 README 來源說明）。用法：
  python3 tools/gen_en_lessons.py /path/to/google-10000-english-usa-no-swears.txt
"""
import json, sys, re, random

WORDS_PATH = sys.argv[1]
fing = json.load(open('data/fingers.json'))
fname = {k: v['name'] for k, v in fing['fingers'].items()}
code_of = {}
finger_of = {}
for row in fing['layout']:
    for k in row:
        if k.get('key'):
            code_of[k['key']] = k['code']; finger_of[k['key']] = k['finger']

JUNK = set('''www http https com org net edu gov pdf html htm url faq inc ltd llc cd dvd usb gb mb kb mp3 xml php asp css sql
cgi gif jpg jpeg png rss tv pc ii iii iv vs etc ebay amazon google yahoo msn aol hotmail myspace youtube facebook twitter
linux microsoft windows dell ibm hp sony nokia apple cnet bbc cnn nbc cbs abc usa uk eu un us ca ny tx fl nj pa va wa ga
nc mi oh il ma tn mo wi mn az sc al ky la ok ct ut ia nv ar ms ks nm ne wv id hi me nh ri mt de sd nd ak vt wy dc gmt est pst
jan feb mar apr jun jul aug sep sept oct nov dec mon tue wed thu fri sat sun ave blvd rd st dr mr mrs ms dr jr sr ph ref
re cm mm kg km lb oz ft sq vol vols pp ie eg viewing sex porn xxx adult casino poker gambling viagra pills drugs
lyrics download downloads sitemap login website websites online forum forums blog blogs email emails click clicks
tel fax ext info nr no inc hr dept dir lt gt amp quot nbsp bin dat txt doc zip exe dll tmp ing'''.split())
BAD = set('sexy nude nudes naked escort escorts erotic fetish bondage lesbian gay penis anal tits boob boobs cock cocks dick \
hardcore teens teen porno sluts slut whore rape rapes drug drugs cocaine heroin cigarette cigarettes tobacco alcohol beer wine \
vodka drunk kill kills killed killing murder murders gun guns weapon weapons bomb bombs war wars dead death die dies'.split())
allw = [w.strip().lower() for w in open(WORDS_PATH) if w.strip()]
allw = [w for w in allw if w.isalpha() and w not in JUNK and w not in BAD and (len(w) >= 2 or w in ('a', 'i'))]
allw = allw[:4000]
rank = {w: i for i, w in enumerate(allw)}

ORDER = [('ei', 2, 'E I'), ('ru', 3, 'R U'), ('ty', 4, 'T Y'), ('gh', 5, 'G H'), ('wo', 6, 'W O'),
         ('qp', 7, 'Q P'), ('c,', 8, 'C ,'), ('vm', 9, 'V M'), ('x.', 10, 'X .'), ('zbn/', 11, 'Z B N /')]
base = set('asdfjkl;')

def keycode(ch):
    return {',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon', "'": 'Quote', '-': 'Minus'}.get(ch) or \
        ('Digit' + ch if ch.isdigit() else 'Key' + ch.upper())

def fdesc(ch):
    f = finger_of.get(ch)
    return fname.get(f, '')

def pick_words(letters, need, n, minlen=2, maxlen=7):
    ls = set(letters)
    out = [w for w in allw if set(w) <= ls and minlen <= len(w) <= maxlen and (not need or set(w) & set(need))]
    return out[:n]

def lesson_letters(letters_set, newk, title, sub, hint_demo, test_time=45, extra_words=None, static_words_text=None):
    pass

rng = random.Random(2027)
lessons = []
learned = set(base)
for new, lid, label in ORDER:
    learned |= set(new)
    letters = ''.join(sorted(c for c in learned if c.isalpha()))
    newl = [c for c in new if c.isalpha()]
    punct = [c for c in new if not c.isalpha()]
    wnew = pick_words(learned, newl, 26)
    wall = pick_words(learned, None, 60, minlen=2)
    if lid == 2:
        wnew = [w for w in wnew]
    tokens = list(wnew)
    # 標點課：把標點黏在詞後面
    if ',' in punct:
        tokens = [w + ',' for w in wnew[:14]] + wnew[14:]
    if '.' in punct:
        tokens = [w + '.' for w in wnew[:14]] + wnew[14:]
    if '/' in punct:
        tokens = tokens + ['yes/no', 'and/or', 'on/off', 'his/her', 'in/out', 'up/down']
    test_words = list(dict.fromkeys(tokens + [w for w in wall[:40]]))
    keys_desc = '、'.join(f"{c.upper()}（{fdesc(c)}）" if c.isalpha() else f"{c}（{fdesc(c)}）" for c in new)
    single = ' '.join(c * 3 for c in new) + ' ' + ' '.join(c * 3 for c in new)
    demo = ' '.join(f"{h} {c}" for c in new for h in (finger_of and
            {'e':'d','i':'k','r':'f','u':'j','t':'f','y':'j','g':'f','h':'j','w':'s','o':'l','q':'a','p':';',
             'c':'d',',':'k','v':'f','m':'j','x':'s','.':'l','z':'a','b':'f','n':'j','/':';'}[c],)) + ' ' + ' '.join(new)
    chars = ''.join(new) * 3 + ''.join(sorted(learned))
    steps = [
        {"type": "drill", "title": "示範", "hint": f"新鍵：{keys_desc}。伸出手指按，按完馬上回到基準位。", "display": "big", "text": demo.strip()},
        {"type": "drill", "title": "單鍵", "hint": "每組三下，只用負責的那隻手指。", "text": single},
        {"type": "drill", "title": "組合", "hint": "新鍵配合學過的鍵，保持節奏，先求準。",
         "gen": {"kind": "groups", "chars": chars, "groups": 16, "minLen": 2, "maxLen": 4}},
        {"type": "drill", "title": "詞語", "hint": "全部都是真正的英文詞，只用學過的鍵。",
         "gen": {"kind": "words", "words": tokens, "count": 18}},
        {"type": "test", "title": "過關小測", "hint": "45 秒內打得愈多愈好，準確率達 90% 即過關。", "timeLimit": 45,
         "pass": {"accuracy": 90}, "gen": {"kind": "words", "words": test_words, "count": 60}},
    ]
    newKeys = [keycode(c) for c in new]
    lessons.append({"id": lid, "title": f"新鍵 {label}", "subtitle": f"{label}：{ '、'.join(fdesc(c) for c in new)}",
                    "newKeys": newKeys, "pass": {"accuracy": 90}, "steps": steps})

# ---- 第 12 課：Shift 大寫 ----
names = ['Anna', 'Ben', 'Cathy', 'Dan', 'Eva', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Nick',
         'Olivia', 'Paul', 'Queen', 'Ryan', 'Sam', 'Tina', 'Una', 'Vic', 'Will', 'Xander', 'Yuki', 'Zoe',
         'Hong Kong', 'China', 'Monday', 'Friday', 'May', 'June', 'April', 'Tom', 'Amy', 'Bob']
common = [w.capitalize() for w in pick_words(set('abcdefghijklmnopqrstuvwxyz'), None, 60, 3, 6)]
lessons.append({
    "id": 12, "title": "Shift 與大寫", "subtitle": "用對側尾指按 Shift", "newKeys": ["ShiftLeft", "ShiftRight"],
    "pass": {"accuracy": 90}, "steps": [
        {"type": "drill", "title": "示範", "hint": "打右手的字母，用左手尾指按 Shift；打左手的字母，用右手尾指按 Shift。Shift 要先按住，再按字母。",
         "display": "big", "text": "F J D K S L A ;".replace(';', 'J')},
        {"type": "drill", "title": "單鍵", "hint": "每個大寫字母打兩下，Shift 用對側尾指。", "text": "AA SS DD FF JJ KK LL AA SS DD FF JJ KK LL"},
        {"type": "drill", "title": "組合", "hint": "大寫和小寫交替，Shift 放開後手指回到基準位。",
         "gen": {"kind": "words", "words": ['Ad', 'Jaff', 'Dad', 'Sal', 'Kal', 'Lad', 'Ask', 'Fall', 'Flask', 'Jill', 'Kids', 'Dale'], "count": 14}},
        {"type": "drill", "title": "詞語", "hint": "人名和星期，第一個字母大寫。",
         "gen": {"kind": "words", "words": names, "count": 16}},
        {"type": "test", "title": "過關小測", "hint": "45 秒內打得愈多愈好，準確率達 90% 即過關。", "timeLimit": 45,
         "pass": {"accuracy": 90}, "gen": {"kind": "words", "words": names + common, "count": 60}},
    ]})

# ---- 第 13 課：數字列 ----
nums = ['10', '25', '100', '2027', '1999', '365', '7', '48', '63', '519', '804', '12', '30', '45', '9', '81', '16', '20', '5', '60',
        '3.5', '1,000', '24', '2028', '77', '88', '39', '40', '50']
lessons.append({
    "id": 13, "title": "數字列", "subtitle": "1 2 3 4 5 6 7 8 9 0", "newKeys": [keycode(c) for c in '1234567890'],
    "pass": {"accuracy": 90}, "steps": [
        {"type": "drill", "title": "示範", "hint": "數字在最上一行。左手 1 尾指、2 無名指、3 中指、4 和 5 食指；右手 6 和 7 食指、8 中指、9 無名指、0 尾指。",
         "display": "big", "text": "f 4 f 5 j 6 j 7 d 3 k 8 s 2 l 9 a 1 ; 0"},
        {"type": "drill", "title": "單鍵", "hint": "每個數字打三下，按完回到基準位。",
         "text": "111 222 333 444 555 666 777 888 999 000 111 222 333 444 555 666 777 888 999 000"},
        {"type": "drill", "title": "組合", "hint": "數字混合，保持節奏。",
         "gen": {"kind": "groups", "chars": "1234567890", "groups": 16, "minLen": 2, "maxLen": 4}},
        {"type": "drill", "title": "詞語", "hint": "常見的數字：年份、日期、數量。",
         "gen": {"kind": "words", "words": nums, "count": 18}},
        {"type": "test", "title": "過關小測", "hint": "45 秒內打得愈多愈好，準確率達 90% 即過關。", "timeLimit": 45,
         "pass": {"accuracy": 90},
         "gen": {"kind": "words", "words": nums + ['5 cats', '12 dogs', '3 kids', '8 fish', '20 days', '7 days', '100 men', '9 birds'], "count": 50}},
    ]})

# ---- 第 14 課：常用標點 ----
puncs = ["don't", "it's", "I'm", "can't", "won't", "that's", "let's", '"yes"', '"no"', '"hello"', 'What?', 'Why?', 'How?', 'Who?',
         'Wow!', 'Stop!', 'Yes!', 'Help!', 'well-known', 'long-term', 'check-in', 'T-shirt', 'Note:', 'Time:', 'Name:', 'Date:', 'Class:']
lessons.append({
    "id": 14, "title": "常用標點", "subtitle": "' \" ? ! - :", "newKeys": ["Quote", "Minus", "Slash", "Digit1", "Semicolon"],
    "pass": {"accuracy": 90}, "steps": [
        {"type": "drill", "title": "示範", "hint": "單引號在 ; 右邊，用右手尾指。? 是 Shift + /，! 是 Shift + 1，冒號是 Shift + ;，引號 \" 是 Shift + '。連字號 - 在數字 0 的右邊，右手尾指。",
         "display": "big", "text": "' - ? ! : \""},
        {"type": "drill", "title": "單鍵", "hint": "每個符號打三下，需要 Shift 的記得用對側尾指。", "text": "''' --- ??? !!! ::: \"\"\" ''' --- ??? !!! ::: \"\"\""},
        {"type": "drill", "title": "組合", "hint": "標點放在字詞之間。", "gen": {"kind": "words", "words": ["a-a", "d-k", "s'l", "f?", "j!", "k:", "l'd", "a?s", "d!f", "s:l", "f-j", "k'a"], "count": 16}},
        {"type": "drill", "title": "詞語", "hint": "真正的英文用法：縮寫、問句、感嘆句。", "gen": {"kind": "words", "words": puncs, "count": 18}},
        {"type": "test", "title": "過關小測", "hint": "45 秒內打得愈多愈好，準確率達 90% 即過關。", "timeLimit": 45,
         "pass": {"accuracy": 90}, "gen": {"kind": "words", "words": puncs, "count": 50}},
    ]})

# ---- 第 15 課：最常用 200 詞 ----
c200 = [w for w in allw if len(w) >= 2 or w in ('a', 'i')][:200]
c200 = [('I' if w == 'i' else w) for w in c200]
lessons.append({
    "id": 15, "title": "最常用 200 詞", "subtitle": "整個詞一氣呵成", "newKeys": [],
    "pass": {"wpm": 8, "accuracy": 90}, "steps": [
        {"type": "drill", "title": "示範", "hint": "最常見的詞，用整個詞的節奏打，不要逐個字母想。", "display": "big", "text": "the of and to in is that for it you"},
        {"type": "drill", "title": "第 1–100 詞", "hint": "放鬆手腕，保持穩定的節奏。", "gen": {"kind": "words", "words": c200[:100], "count": 22}},
        {"type": "drill", "title": "第 101–200 詞", "hint": "愈來愈熟了，留意準確。", "gen": {"kind": "words", "words": c200[100:], "count": 22}},
        {"type": "drill", "title": "混合練習", "hint": "全部 200 詞混合。", "gen": {"kind": "words", "words": c200, "count": 30}},
        {"type": "test", "title": "過關小測", "hint": "60 秒內，速度達 8 WPM、準確率達 90% 即過關。", "timeLimit": 60,
         "pass": {"wpm": 8, "accuracy": 90}, "gen": {"kind": "words", "words": c200, "count": 100}},
    ]})

# ---- 第 16 課：句子與短段落 ----
sents = [
    "The sun is up and we go to school.", "I like to read books in the library.", "My friend has a small brown dog.",
    "Please open your book to page ten.", "We will have a test on Friday.", "She can play the piano very well.",
    "It is a good day to learn something new.", "Our class plays football after lunch.", "Can you help me with my homework?",
    "He walks to the bus stop every morning.", "Thank you for your help today!", "The cat sat on the warm window.",
    "We need to drink water and sleep well.", "Typing gets easier when you practise every day.", "What time does the class start?",
    "Look at the screen, not at the keys.", "Good typists stay calm and keep a steady rhythm.", "My favourite subject is science.",
    "There are twenty-five students in my class.", "Today I typed more words than yesterday!",
]
lessons.append({
    "id": 16, "title": "句子與短段落", "subtitle": "把整句話打出來", "newKeys": [],
    "pass": {"wpm": 10, "accuracy": 90}, "steps": [
        {"type": "drill", "title": "短句", "hint": "大寫、標點都要打對。慢一點沒關係。", "gen": {"kind": "words", "words": sents[:10], "count": 3}},
        {"type": "drill", "title": "長一點的句子", "hint": "句子之間按空白鍵。", "gen": {"kind": "words", "words": sents[10:], "count": 3}},
        {"type": "drill", "title": "短段落", "hint": "像寫日記一樣的幾句話。", "gen": {"kind": "words", "words": sents, "count": 5}},
        {"type": "test", "title": "過關小測", "hint": "60 秒內，速度達 10 WPM、準確率達 90% 即過關。", "timeLimit": 60,
         "pass": {"wpm": 10, "accuracy": 90}, "gen": {"kind": "words", "words": sents, "count": 20}},
    ]})

d = json.load(open('data/en-lessons.json'))
d['lessons'] = [l for l in d['lessons'] if l['id'] in (0, 1)] + lessons
json.dump(d, open('data/en-lessons.json', 'w'), ensure_ascii=False, indent=1)
print('lessons:', [l['id'] for l in d['lessons']])
for l in lessons[:11]:
    ws = l['steps'][3]['gen']['words']; print(l['id'], l['title'], l['steps'][3]['gen']['words'][:24])
print('c200', c200[:60])
