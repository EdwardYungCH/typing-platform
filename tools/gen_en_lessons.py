#!/usr/bin/env python3
"""產生英文第 2–16 課，並併入 data/en-lessons.json（第 0、1 課保持不變）。
詞語：第 2–11 課「詞語」步驟用老師審定的詞表（CURATED，適合中學生、英式串法、只用該課已學的鍵）；
小測另加 New General Service List（NGSL 1.01，CC BY-SA 4.0，tools/src/ngsl/）中只用已學鍵的常用詞。
用法：python3 tools/gen_en_lessons.py
"""
import json, sys, re, random, csv

# 美式串法 → 英式（香港學校用英式）
UK = {'center': 'centre', 'color': 'colour', 'favorite': 'favourite', 'favor': 'favour', 'theater': 'theatre', 'gray': 'grey',
      'honor': 'honour', 'labor': 'labour', 'neighbor': 'neighbour', 'behavior': 'behaviour', 'defense': 'defence',
      'catalog': 'catalogue', 'traveler': 'traveller', 'analyze': 'analyse', 'jewelry': 'jewellery', 'mom': 'mum', 'humor': 'humour',
      'flavor': 'flavour', 'rumor': 'rumour', 'tire': 'tyre', 'meter': 'metre', 'liter': 'litre', 'fiber': 'fibre'}
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
vodka drunk kill kills killed killing murder murders gun guns weapon weapons bomb bombs war wars dead death die dies \
sexual sexually sexo condom condoms gamble bet bets betting dating shit damn hell crap fuck suck sucks kiss kissing'.split())
# 專有名詞（第 12 課才教大寫，之前不應以小寫出現）、網上用語、太冷門的字
PROPER = set('''texas mexico asia china america american americans canada canadian london paris india indian japan japanese
california florida europe european africa african australia australian english french german germany british britain
january february march april may june july august september october november december monday tuesday wednesday thursday
friday saturday sunday christmas easter god jesus christian bible islam york washington chicago boston houston dallas
virginia georgia carolina ohio michigan jersey arizona colorado oregon kansas iowa utah nevada idaho maine alaska hawaii
john david michael james robert paul mark peter smith brown johnson williams jones davis miller wilson taylor
el la le los las del des du der von san santa st ford dell sony apple xbox zealand nintendo playstation'''.split())
WEB = set('''pm am xp ex copyright url id ok fyi asap lol omg diy rsvp vip ceo cfo hiv aids sms mms gps html faq
login logout signup username password spam cookies cookie privacy terms webmaster admin api seo'''.split())
OBSCURE = set('flak lass sass alas fad fads dada ala aka disease assess ad ads'.split())
# 「am」是常用詞（I am），保留
WEB.discard('am')
allw = [UK.get(r['Lemma'].strip().lower(), r['Lemma'].strip().lower()) for r in csv.DictReader(open('tools/src/ngsl/ngsl-1.01.csv', encoding='utf-8'))]
allw = [w for w in allw if w.isalpha() and w not in JUNK and w not in BAD and w not in PROPER and w not in WEB and w not in OBSCURE and (len(w) >= 2 or w in ('a', 'i'))]
allw = allw[:4000]
rank = {w: i for i, w in enumerate(allw)}

# 每課最多 3 個新鍵（2026-10-20 老師定：不要一課教四個鍵）；常用的 B N 提早到第 7 課
ORDER = [('ei', 2, 'E I'), ('ru', 3, 'R U'), ('ty', 4, 'T Y'), ('gh', 5, 'G H'), ('wo', 6, 'W O'),
         ('bn', 7, 'B N'), ('c,', 8, 'C ,'), ('vm', 9, 'V M'), ('qp/', 10, 'Q P /'), ('xz.', 11, 'X Z .')]
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

# 第 2–11 課的詞語（逐個核對過：只用該課已學的鍵）
CURATED = {
 2: 'is if see side like life file slide feel field kids lake idea ideas sea seed safe said did desk desks skill skills ski else less self sell seal leaf lid kid feed fade aid',
 3: 'are red read rule rules sure fire free fur full use used uses area air far fair deer ride rides rider ruler rulers rise ear ears surf drill drills dark sir dress',
 4: 'it at try yet stay test tests sit set first list just start year years day days after take art rate study tidy eat tea tree fly sky easy ready yes yard tasty fast last late later safety sister fruit early daily key keys dirty',
 5: 'the that this they he she her his here there these has had get high right great three light eight fish dish shirt shell hard gift egg eggs huge laugh teeth sheet hike sugar father rush shark hug shy judge',
 6: 'of to for with you or your was we will our other do what out so who also would how were two world go work should look good food word words story follow yellow slow show flower tower towel wolf owl frog door floor row grow write wait water today hours house sweet',
 7: 'and in on by not be new an about but one any only when now been than find into then book books bike bird bread brown blue bed bag ball best birthday nine ten ink banana bus song long dinner run sun fun hand kind nose rain garden window button island',
 8: 'can which back city such school each could because local office car check case cat cake class clean clock cook cool cold cloud chair chicken cards catch coach dance face nice rice ice uncle circle colour science centre',
 9: 'from have more home my time some name over most music make them very many movie move money mother family morning video seven five give love live river visit every travel vegetable museum swim summer monkey milk mum team game maths',
 10: 'page up help people please open put play park pen paper pencil quiet quick question queue equal square sport sports happy apple picture piano pupil shop stop sleep map top jump group type project keep',
 11: 'six box fox next text exam extra fix mix taxi relax example exercise explore excited zoo zero zone size prize pizza puzzle lazy crazy quiz amazing dozen freeze zip',
}
# 單鍵步：由基準鍵伸出去按、按完回來（reach and return），每行兩次
REACH = {2: 'ded ded ded kik kik kik ded kik dek kie ide ded kik', 3: 'frf frf frf juj juj juj frf juj fur ruf urf frf juj',
         4: 'ftf ftf ftf jyj jyj jyj ftf jyj fty ytf ftf jyj', 5: 'fgf fgf fgf jhj jhj jhj fgf jhj fgh hgf fgf jhj',
         6: 'sws sws sws lol lol lol sws lol swo ows sws lol', 7: 'fbf fbf fbf jnj jnj jnj fbf jnj fbn nbf fbf jnj',
         8: 'dcd dcd dcd k,k k,k k,k dcd k,k dc, ,cd dcd k,k', 9: 'fvf fvf fvf jmj jmj jmj fvf jmj fvm mvf fvf jmj',
         10: 'aqa aqa aqa ;p; ;p; ;p; ;/; ;/; aqa ;p; ;/; aqa', 11: 'sxs sxs sxs aza aza aza l.l l.l l.l sxs aza l.l'}
# 過關小測的最低速度（WPM）：準確率之外也要有基本速度
SPEED = {2: 5, 3: 6, 4: 6, 5: 7, 6: 7, 7: 8, 8: 8, 9: 9, 10: 9, 11: 10, 12: 8, 13: 6, 14: 8, 15: 12, 16: 15}
def test_pass(lid): return {'wpm': SPEED[lid], 'accuracy': 90}
def test_hint(lid, sec=45): return f'{sec} 秒內打得愈多愈好，速度達 {SPEED[lid]} WPM、準確率達 90% 即過關。'

rng = random.Random(2027)
lessons = []
learned = set(base)
for new, lid, label in ORDER:
    learned |= set(new)
    letters = ''.join(sorted(c for c in learned if c.isalpha()))
    newl = [c for c in new if c.isalpha()]
    punct = [c for c in new if not c.isalpha()]
    wnew = CURATED[lid].split()
    for w in wnew: assert set(w) <= learned, (lid, w)
    wall = pick_words(learned, None, 60, minlen=2)
    tokens = list(wnew)
    # 標點課：把標點黏在詞後面
    if ',' in punct:   # 逗號放在自然的停頓：「cat, dog, bird」
        tokens = [f'{a}, {b}' for a, b in zip(wnew[0:28:2], wnew[1:28:2])] + wnew[28:]
    if '.' in punct:   # 句號放在詞尾
        tokens = [w + '.' for w in wnew[:14]] + wnew[14:]
    if '/' in punct:
        tokens = tokens + ['yes/no', 'and/or', 'on/off', 'his/her', 'in/out', 'up/down']
    test_words = list(dict.fromkeys(tokens + [w for w in wall[:40]]))
    keys_desc = '、'.join(f"{c.upper()}（{fdesc(c)}）" if c.isalpha() else f"{c}（{fdesc(c)}）" for c in new)
    single = REACH[lid] + ' ' + REACH[lid]
    demo = ' '.join(f"{h} {c}" for c in new for h in (finger_of and
            {'e':'d','i':'k','r':'f','u':'j','t':'f','y':'j','g':'f','h':'j','w':'s','o':'l','q':'a','p':';',
             'c':'d',',':'k','v':'f','m':'j','x':'s','.':'l','z':'a','b':'f','n':'j','/':';'}[c],)) + ' ' + ' '.join(new)
    # 組合：新字母佔一半以上；標點不放在組合中間（標點在「詞語」步練）
    newletters = ''.join(c for c in new if c.isalpha())
    chars = newletters * (len(learned) // max(1, len(newletters))) + ''.join(sorted(c for c in learned if c.isalpha()))
    steps = [
        {"type": "drill", "title": "示範", "hint": f"新鍵：{keys_desc}。伸出手指按，按完馬上回到基準位。", "display": "big", "text": demo.strip()},
        {"type": "drill", "title": "伸指練習", "hint": "由基準鍵伸出去按新鍵，再回到基準鍵（例如 d → e → d）。看大鍵卡的手指提示。", "display": "single", "text": single},
        {"type": "drill", "title": "組合", "hint": "新鍵配合學過的鍵，保持節奏，先求準。",
         "gen": {"kind": "groups", "chars": chars, "groups": 24, "minLen": 2, "maxLen": 4}},
        {"type": "drill", "title": "詞語", "hint": "全部都是真正的英文詞，只用學過的鍵。",
         "gen": {"kind": "words", "words": tokens, "count": 18}},
        {"type": "test", "title": "過關小測", "hint": test_hint(lid), "timeLimit": 45,
         "pass": test_pass(lid), "gen": {"kind": "words", "words": test_words, "count": 60}},
    ]
    newKeys = [keycode(c) for c in new]
    lessons.append({"id": lid, "title": f"新鍵 {label}", "subtitle": f"{label}：{ '、'.join(fdesc(c) for c in new)}",
                    "newKeys": newKeys, "pass": test_pass(lid), "steps": steps})

# ---- 第 12 課：Shift 大寫 ----
names = ['Anna', 'Ben', 'Cathy', 'Dan', 'Eva', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Nick',
         'Olivia', 'Paul', 'Quinn', 'Ryan', 'Sam', 'Tina', 'Una', 'Vic', 'Will', 'Xavier', 'Yuki', 'Zoe',
         'Hong Kong', 'Kowloon', 'Sha Tin', 'Tsuen Wan', 'Lantau', 'Wong', 'Chan', 'Monday', 'Friday', 'May', 'June', 'April', 'Tom', 'Amy', 'Bob']
caps_sents = ['I am Ken.', 'I like it.', 'We go home.', 'Amy is here.', 'Ben has a cat.', 'I can swim.', 'Tom is my friend.', 'It is Monday.',
              'She lives in Sha Tin.', 'I love Hong Kong.', 'My name is Ivy.', 'We play on Friday.']
lessons.append({
    "id": 12, "title": "Shift 與大寫", "subtitle": "用對側尾指按 Shift", "newKeys": ["ShiftLeft", "ShiftRight"],
    "pass": test_pass(12), "steps": [
        {"type": "drill", "title": "示範", "hint": "打右手的字母，用左手尾指按 Shift；打左手的字母，用右手尾指按 Shift。Shift 要先按住，再按字母。",
         "display": "big", "text": "F J D K S L A ;".replace(';', 'J')},
        {"type": "drill", "title": "單鍵", "hint": "每個大寫字母打兩下，Shift 用對側尾指。", "text": "AA SS DD FF JJ KK LL Ed Ivy Rose Uma Tom Yan AA SS DD FF JJ KK LL"},
        {"type": "drill", "title": "組合", "hint": "大寫和小寫交替，Shift 放開後手指回到基準位。",
         "gen": {"kind": "words", "words": ['Ad', 'Add', 'Dad', 'Sal', 'Sad', 'Lad', 'Ask', 'Fall', 'Salad', 'Jill', 'Kids', 'Dale'], "count": 14}},
        {"type": "drill", "title": "詞語", "hint": "人名、地方、星期和月份，第一個字母大寫。",
         "gen": {"kind": "words", "words": names, "count": 16}},
        {"type": "test", "title": "過關小測", "hint": test_hint(12), "timeLimit": 45,
         "pass": test_pass(12), "gen": {"kind": "words", "words": names + caps_sents, "count": 40}},
    ]})

# ---- 第 13 課：數字列 ----
nums = ['10', '25', '100', '2027', '1999', '365', '7', '48', '63', '519', '804', '12', '30', '45', '9', '81', '16', '20', '5', '60',
        '3.5', '1,000', '24', '2028', '77', '88', '39', '40', '50', 'Room 204', 'Form 1A', '2345 6789', '4/11/2026', '9/9']
lessons.append({
    "id": 13, "title": "數字列", "subtitle": "1 2 3 4 5 6 7 8 9 0", "newKeys": [keycode(c) for c in '1234567890'],
    "pass": test_pass(13), "steps": [
        {"type": "drill", "title": "示範", "hint": "數字在最上一行。左手 1 尾指、2 無名指、3 中指、4 和 5 食指；右手 6 和 7 食指、8 中指、9 無名指、0 尾指。",
         "display": "big", "text": "f 4 f 5 j 6 j 7 d 3 k 8 s 2 l 9 a 1 ; 0"},
        {"type": "drill", "title": "單鍵", "hint": "每個數字打三下，按完回到基準位。",
         "text": "111 222 333 444 555 666 777 888 999 000 111 222 333 444 555 666 777 888 999 000"},
        {"type": "drill", "title": "組合", "hint": "數字混合，保持節奏。",
         "gen": {"kind": "groups", "chars": "1234567890", "groups": 16, "minLen": 2, "maxLen": 4}},
        {"type": "drill", "title": "詞語", "hint": "常見的數字：年份、日期、數量。",
         "gen": {"kind": "words", "words": nums, "count": 18}},
        {"type": "test", "title": "過關小測", "hint": test_hint(13), "timeLimit": 45,
         "pass": test_pass(13),
         "gen": {"kind": "words", "words": nums + ['5 cats', '12 dogs', '3 kids', '8 fish', '20 days', '7 days', '100 marks', '9 birds'], "count": 50}},
    ]})

# ---- 第 14 課：常用標點 ----
puncs = ["don't", "it's", "I'm", "can't", "won't", "that's", "let's", '"yes"', '"no"', '"hello"', 'What?', 'Why?', 'How?', 'Who?',
         'Wow!', 'Stop!', 'Yes!', 'Help!', 'well-known', 'long-term', 'check-in', 'T-shirt', 'Note:', 'Time:', 'Name:', 'Date:', 'Class:']
lessons.append({
    "id": 14, "title": "常用標點", "subtitle": "' \" ? ! - :", "newKeys": ["Quote", "Minus", "Slash", "Digit1", "Semicolon"],
    "pass": test_pass(14), "steps": [
        {"type": "drill", "title": "示範", "hint": "單引號在 ; 右邊，用右手尾指。? 是 Shift + /，! 是 Shift + 1，冒號是 Shift + ;，引號 \" 是 Shift + '。連字號 - 在數字 0 的右邊，右手尾指。",
         "display": "big", "text": "' - ? ! : \""},
        {"type": "drill", "title": "單鍵", "hint": "每個符號打三下，需要 Shift 的記得用對側尾指。", "text": "''' --- ??? !!! ::: \"\"\" ''' --- ??? !!! ::: \"\"\""},
        {"type": "drill", "title": "組合", "hint": "標點放在字詞之間。", "gen": {"kind": "words", "words": ["Is it?", "Yes!", "No:", "ask Dad.", "I'd", "it's", "Ah!", "Sad?", "a-a", "Dad's", "Oh no!", "Hi!"], "count": 16}},
        {"type": "drill", "title": "詞語", "hint": "真正的英文用法：縮寫、問句、感嘆句。", "gen": {"kind": "words", "words": puncs, "count": 18}},
        {"type": "test", "title": "過關小測", "hint": test_hint(14), "timeLimit": 45,
         "pass": test_pass(14), "gen": {"kind": "words", "words": puncs, "count": 50}},
    ]})

# ---- 第 15 課：最常用 200 詞 ----
# 學生常用 200 詞：按 Fry Instant Words 首 200 個改編（換走 America、oil 等不適合打字練習的字）
c200 = '''the of and a to in is you that it he was for on are as with his they I at be this have from or one had by
words but not what all were we when your can said there use an each which she do how their if will up other about out
many then them these so some her would make like him into time has look two more write go see number no way could people
my than first water been called who now find long down day did get come made may part over new sound take only little
work know place years live me back give most very after things our just name good sentence man think say great where help
through much before line right too means old any same tell boy follow came want show also around form three small set
put end does another well large must big even such because turned here why asked went men read need land different home
us move try kind hand picture again change off play spell air away animal house point page letter mother answer found
study still learn should school world friend family'''.split()
assert len(c200) == 200, len(c200)
lessons.append({
    "id": 15, "title": "最常用 200 詞", "subtitle": "學生最常用的英文詞", "newKeys": [],
    "pass": test_pass(15), "steps": [
        {"type": "drill", "title": "示範", "hint": "最常見的詞，用整個詞的節奏打，不要逐個字母想。", "display": "big", "text": "the of and to in is that for it you"},
        {"type": "drill", "title": "第 1–100 詞", "hint": "放鬆手腕，保持穩定的節奏。", "gen": {"kind": "words", "words": c200[:100], "count": 22}},
        {"type": "drill", "title": "第 101–200 詞", "hint": "愈來愈熟了，留意準確。", "gen": {"kind": "words", "words": c200[100:], "count": 22}},
        {"type": "drill", "title": "混合練習", "hint": "全部 200 詞混合。", "gen": {"kind": "words", "words": c200, "count": 30}},
        {"type": "test", "title": "過關小測", "hint": test_hint(15, 60), "timeLimit": 60,
         "pass": test_pass(15), "gen": {"kind": "words", "words": c200, "count": 100}},
    ]})

# ---- 第 16 課：連貫的短段落（香港生活、英式串法）----
paras = [
    "My name is Ken and I am in Form One. I go to school by MTR every morning. My favourite lesson is Computer because we learn to type with ten fingers.",
    "It was a hot day in July. Mum and I took a ferry to Cheung Chau. We rode bikes, ate fish balls and swam at the beach. I was tired but happy when we got home.",
    "Our class is planning a party for the end of term. Amy will bring cups and plates, Ben will make a poster, and I will choose the music. We hope everyone can come!",
    "Typing is a useful skill. At first it feels slow because you must not look at the keys. Keep your fingers on the home row, sit up straight and practise for ten minutes a day.",
]
test_para = ("Last Saturday our class visited a farm in the New Territories. The farmer showed us how to plant lettuce and "
             "pick tomatoes. We also fed the goats, which were very hungry and a little noisy. At lunch we ate the vegetables "
             "we had picked, and they tasted much better than the ones from the supermarket. Before we left, the farmer gave "
             "each of us a small pot with a seed in it. Mine has already started to grow!")
lessons.append({
    "id": 16, "title": "句子與短段落", "subtitle": "把一段完整的文字打出來", "newKeys": [],
    "pass": test_pass(16), "steps": [
        {"type": "drill", "title": "第 1 段", "hint": "大寫、標點都要打對。慢一點沒關係。", "text": paras[0]},
        {"type": "drill", "title": "第 2 段", "hint": "句子之間按一下空白鍵。", "text": paras[1]},
        {"type": "drill", "title": "第 3 段", "hint": "留意逗號和感嘆號。", "text": paras[2]},
        {"type": "drill", "title": "第 4 段", "hint": "保持穩定的節奏，眼睛看螢幕。", "text": paras[3]},
        {"type": "test", "title": "過關小測", "hint": test_hint(16, 60), "timeLimit": 60, "pass": test_pass(16), "text": test_para},
    ]})

# 句子庫（每日任務、練習區「句子」用）：每句記下要學到第幾課才打得到
def need_lesson(t):
    if re.search(r"['\"?!:\-]", t): return 14
    if re.search(r'\d', t): return 13
    if re.search(r'[A-Z]', t): return 12
    keys = set(t.lower()) - set(' ')
    n = 1
    for new, lid, _ in ORDER:
        if keys & set(new): n = lid
    return n
pool = list(dict.fromkeys([*paras, test_para.split('. ')[0] + '.', *[x for p2 in paras for x in re.split(r'(?<=[.!?]) ', p2)],
    "The sun is up and we go to school.", "I like to read books in the library.", "My friend has a small brown dog.",
    "Please open your books at page ten.", "We will have a test on Friday.", "She can play the piano very well.",
    "It is a good day to learn something new.", "Our class plays football after lunch.", "Can you help me with my homework?",
    "He walks to the bus stop every morning.", "Thank you for your help today!", "The cat sat on the warm windowsill.",
    "We need to drink water and sleep well.", "Typing gets easier when you practise every day.", "What time does the class start?",
    "Look at the screen, not at the keys.", "Good typists stay calm and keep a steady rhythm.", "My favourite subject is science.",
    "There are twenty-five students in my class.", "Today I typed more words than yesterday!",
    "we read a book at lunch", "the kids ride bikes in the park", "she has a red bag", "he likes fresh fruit",
    "we will go to the zoo next week", "my mother cooks rice and fish", "the quiet pupil drew a picture"]))
json.dump({'_說明': '英文句子庫：每日任務和練習區「句子練習」用。lesson 是打得到這句要完成的課（之前未學的鍵不會出現）。由 tools/gen_en_lessons.py 產生。',
           'sentences': [{'text': t, 'lesson': need_lesson(t)} for t in pool]}, open('data/en-sentences.json', 'w'), ensure_ascii=False, indent=1)

d = json.load(open('data/en-lessons.json'))
d['lessons'] = [l for l in d['lessons'] if l['id'] in (0, 1)] + lessons
json.dump(d, open('data/en-lessons.json', 'w'), ensure_ascii=False, indent=1)
print('lessons:', [l['id'] for l in d['lessons']])
for l in lessons[:10]:
    ws = l['steps'][3]['gen']['words']; print(l['id'], l['title'], ws[:12])
print('c200', c200[:60])
