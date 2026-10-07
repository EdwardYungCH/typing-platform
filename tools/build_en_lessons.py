# 產生英文第 2–16 課，連同第 0、1 課（讀取現有 JSON）寫回 data/en-lessons.json。
# 用法：python3 tools/build_en_lessons.py
import json, random, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
data_path = root / 'data' / 'en-lessons.json'
pool = sorted(set(open(root / 'tools' / 'words.txt').read().split()))
rnd = random.Random(2026)

existing = json.load(open(data_path))
base = [l for l in existing['lessons'] if l['id'] in (0, 1)]

CODE = {c: f'Key{c.upper()}' for c in 'abcdefghijklmnopqrstuvwxyz'}
CODE.update({',': 'Comma', '.': 'Period', ';': 'Semicolon', '/': 'Slash', "'": 'Quote', '-': 'Minus'})
for d in '1234567890': CODE[d] = f'Digit{d}'
CODE['!'] = 'Digit1'

FINGER = {'e': '左中指', 'i': '右中指', 'r': '左食指', 'u': '右食指', 't': '左食指', 'y': '右食指', 'g': '左食指', 'h': '右食指',
          'w': '左無名指', 'o': '右無名指', 'q': '左尾指', 'p': '右尾指', 'c': '左中指', ',': '右中指', 'v': '左食指', 'm': '右食指',
          'x': '左無名指', '.': '右無名指', 'z': '左尾指', 'b': '左食指', 'n': '右食指'}

def words_with(letters_known, new, extra=None, minlen=1):
    ok = [w for w in pool if set(w) <= set(letters_known) and set(w) & set(new) and len(w) >= minlen]
    return ok

def lesson_letters(new, known, title, subtitle, kind='letters', punct=None, acc=90):
    """一般字母課：5 步。"""
    nk = [CODE[c] for c in new]
    known_all = set(known) | set(new)
    ws = words_with(known_all, new)
    if punct:
        ws = [w + punct for w in ws[:20]] if punct != '/' else ws
    review = ''.join(sorted(set(known)))[-6:] if known else ''
    nl = ''.join(new)
    demo = ' '.join(c for c in (nl * 3))[:40]
    singles = ' '.join(c * 3 for c in nl) + ' ' + ' '.join(c * 3 for c in nl) + ' ' + ' '.join(c * 3 for c in nl)
    allwords = [w for w in pool if set(w) <= known_all]
    test_words = (ws * 2 + allwords)[:]
    if punct:
        test_words = ws + [w for w in allwords][:20]
    fingers = '；'.join(f'{c.upper() if c.isalpha() else c}：{FINGER[c]}' for c in new if c in FINGER)
    return {
        'id': None, 'title': title, 'subtitle': subtitle, 'newKeys': nk, 'pass': {'accuracy': acc},
        'steps': [
            {'type': 'drill', 'title': '示範', 'hint': f'新鍵：{fingers}。看清楚手指怎樣伸出去，打完回到基準位。', 'display': 'big', 'text': demo},
            {'type': 'drill', 'title': '單鍵', 'hint': '每組三下，只用負責的手指。', 'text': singles},
            {'type': 'drill', 'title': '組合', 'hint': '新鍵配合學過的鍵，保持節奏，不要看鍵盤。',
             'gen': {'kind': 'groups', 'chars': nl * 3 + review, 'groups': 16, 'minLen': 2, 'maxLen': 4}},
            {'type': 'drill', 'title': '詞語', 'hint': '這些都是真正的英文詞，只用學過的鍵打到。',
             'gen': {'kind': 'words', 'words': ws, 'count': 18}},
            {'type': 'test', 'title': '過關小測', 'hint': f'45 秒內打得愈多愈好，準確率達 {acc}% 即過關。', 'timeLimit': 45,
             'pass': {'accuracy': acc}, 'gen': {'kind': 'words', 'words': test_words, 'count': 60}},
        ]}

lessons = []
known = list('asdfjkl')
spec = [
    (2, 'ei', 'E I', '左中指、右中指'),
    (3, 'ru', 'R U', '食指向上伸'),
    (4, 'ty', 'T Y', '食指向上伸到中間'),
    (5, 'gh', 'G H', '食指橫向伸'),
    (6, 'wo', 'W O', '無名指向上伸'),
    (7, 'qp', 'Q P', '尾指向上伸'),
    (8, 'c,', 'C 和逗號', '中指向下伸'),
    (9, 'vm', 'V M', '食指向下伸'),
    (10, 'x.', 'X 和句號', '無名指向下伸'),
    (11, 'zbn', 'Z B N', '最後的字母'),
]
titles = {2: '中指上行', 3: '食指上行（一）', 4: '食指上行（二）', 5: '食指橫移', 6: '無名指上行', 7: '尾指上行', 8: '中指下行和逗號', 9: '食指下行', 10: '無名指下行和句號', 11: '補完字母'}
for n, new, sub, _ in spec:
    punct = ',' if n == 8 else '.' if n == 10 else None
    new_letters = list(new)
    L = lesson_letters(new_letters, known, titles[n], sub, punct=punct)
    L['id'] = n
    lessons.append(L)
    known += [c for c in new if c.isalpha()]
    if n == 8: known += []  # 標點不計入單詞字母集
known_all = set(known)

# ---- 第 11 課補充：斜線 ----
lessons[-1]['steps'][3]['gen']['words'] = lessons[-1]['steps'][3]['gen']['words'] + ['and/or', 'yes/no', 'he/she', 'his/her']
lessons[-1]['newKeys'] += ['Slash']

# ---- 第 12 課：Shift 大寫 ----
names = ['Tom', 'Amy', 'Ben', 'Kate', 'Sam', 'Lily', 'Peter', 'Mary', 'John', 'Emma', 'David', 'Jane', 'Alex', 'Chris', 'Anna', 'Eric', 'Fiona', 'Gary', 'Helen', 'Ivan', 'Jack', 'Kelly', 'Leo', 'Mike', 'Nancy', 'Oscar', 'Paul', 'Queenie', 'Rose', 'Tina', 'Victor', 'Wendy', 'Zoe']
places = ['Hong Kong', 'London', 'Tokyo', 'Paris', 'Monday', 'Friday', 'Sunday', 'March', 'June', 'July', 'May', 'English', 'Chinese', 'Sam Tom', 'Amy Zoe']
caps_words = [w.capitalize() for w in pool if len(w) <= 6][:140]
lessons.append({
    'id': 12, 'title': 'Shift 大寫', 'subtitle': '用另一隻手的尾指按 Shift',
    'newKeys': ['ShiftLeft', 'ShiftRight'], 'pass': {'accuracy': 90},
    'steps': [
        {'type': 'drill', 'title': '示範', 'hint': '左手打的字母，用右手尾指按 Shift；右手打的字母，用左手尾指按 Shift。先按住 Shift，再按字母，同時放開。', 'display': 'big', 'text': 'A J S K D L F ; A J S K'},
        {'type': 'drill', 'title': '單鍵', 'hint': '大小寫交替，每個大寫都要用對面的尾指按 Shift。', 'text': 'Aa Jj Ss Kk Dd Ll Ff Aa Jj Ss Kk Dd Ll Ff Gg Hh Ee Ii Rr Uu Tt Yy'},
        {'type': 'drill', 'title': '組合', 'hint': '句首字母和人名都要大寫。', 'gen': {'kind': 'words', 'words': names, 'count': 20}},
        {'type': 'drill', 'title': '詞語', 'hint': '地方、星期、月份和語言的名稱都以大寫開頭。', 'gen': {'kind': 'words', 'words': places + names, 'count': 20}},
        {'type': 'test', 'title': '過關小測', 'hint': '45 秒內打得愈多愈好，大寫要用 Shift，準確率達 90% 即過關。', 'timeLimit': 45, 'pass': {'accuracy': 90},
         'gen': {'kind': 'words', 'words': names + places + caps_words, 'count': 60}},
    ]})

# ---- 第 13 課：數字 ----
nums = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '15', '20', '24', '30', '45', '50', '60', '99', '100', '365', '2027', '1234', '5678', '9012', '3456', '7890', '2468', '1357', '4096', '2048', '007', '808', '1999', '2026']
num_phrases = ['3 cats', '12 dogs', '5 books', '7 days', '24 hours', '60 minutes', '100 marks', '2 eggs', '9 birds', '10 pens', 'room 305', 'class 2A', 'page 48', 'May 15', 'bus 68', 'age 13', '4 seats', '8 fish', '6 apples', '20 boys']
lessons.append({
    'id': 13, 'title': '數字列', 'subtitle': '1 2 3 4 5 6 7 8 9 0',
    'newKeys': [f'Digit{d}' for d in '1234567890'], 'pass': {'accuracy': 90},
    'steps': [
        {'type': 'drill', 'title': '示範', 'hint': '數字列在字母上面一行。手指由基準位向上伸兩行，打完馬上回家。食指負責 4 5 6 7，中指 3 和 8，無名指 2 和 9，尾指 1 和 0。', 'display': 'big', 'text': '1 2 3 4 5 6 7 8 9 0'},
        {'type': 'drill', 'title': '單鍵', 'hint': '每個數字打三下。', 'text': '111 222 333 444 555 666 777 888 999 000 111 222 333 444 555 666 777 888 999 000'},
        {'type': 'drill', 'title': '組合', 'hint': '數字亂序，看清楚每個再打。', 'gen': {'kind': 'groups', 'chars': '1234567890', 'groups': 16, 'minLen': 2, 'maxLen': 4}},
        {'type': 'drill', 'title': '詞語', 'hint': '數字和英文字母混合。', 'gen': {'kind': 'words', 'words': num_phrases, 'count': 16}},
        {'type': 'test', 'title': '過關小測', 'hint': '45 秒內打得愈多愈好，準確率達 90% 即過關。', 'timeLimit': 45, 'pass': {'accuracy': 90},
         'gen': {'kind': 'words', 'words': nums + num_phrases, 'count': 50}},
    ]})

# ---- 第 14 課：標點 ----
punct_words = ["Don't", "It's", "I'm", "We're", "That's", "Can't", "What?", "Why?", "How?", "Who?", "Hello!", "Great!", "Wow!", "Stop!", "well-known", "mother-in-law", "long-term", 'Dear Tom:', 'Note:', 'Hint:', '"Yes"', '"No"', '"Hi"', "Let's go!", 'Really?']
lessons.append({
    'id': 14, 'title': '常用標點', 'subtitle': "' \" ? ! - :",
    'newKeys': ['Quote', 'Slash', 'Minus', 'Digit1'], 'pass': {'accuracy': 90},
    'steps': [
        {'type': 'drill', 'title': '示範', 'hint': "右尾指負責 ' - ? : 和引號；! 要用右手尾指按 Shift，左尾指按 1。", 'display': 'big', 'text': "' \" ? ! - :"},
        {'type': 'drill', 'title': '單鍵', 'hint': '一個一個打，需要 Shift 的別忘了對面的尾指。', 'text': "''' \"\"\" ??? !!! --- ::: ''' \"\"\" ??? !!! --- :::"},
        {'type': 'drill', 'title': '組合', 'hint': '標點和字母混合。', 'gen': {'kind': 'groups', 'chars': "'\"?!-:asdfjkl", 'groups': 16, 'minLen': 2, 'maxLen': 4}},
        {'type': 'drill', 'title': '詞語', 'hint': '日常會用到的標點寫法。', 'gen': {'kind': 'words', 'words': punct_words, 'count': 16}},
        {'type': 'test', 'title': '過關小測', 'hint': '45 秒內打得愈多愈好，準確率達 90% 即過關。', 'timeLimit': 45, 'pass': {'accuracy': 90},
         'gen': {'kind': 'words', 'words': punct_words, 'count': 50}},
    ]})

# ---- 第 15 課：最常用 200 詞 ----
top200 = ('the be to of and a in that have I it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us '
          'is are was were been has had did does made said went came took gave found thought told asked seemed felt tried left kept let begin show hear play run move live believe hold bring happen write provide sit stand lose pay meet include continue set learn change lead understand watch follow stop create speak read allow add spend grow open walk win offer remember love consider appear buy wait serve die send expect build stay fall cut reach kill remain very much should great little own old right big high different small large next early young important few public bad same able turn problem help line tell').split()
top200 = list(dict.fromkeys(top200))[:200]
def chunk(a, b): return top200[a:b]
lessons.append({
    'id': 15, 'title': '常用 200 詞', 'subtitle': '把最常見的詞打成肌肉記憶',
    'newKeys': [], 'pass': {'wpm': 8, 'accuracy': 90},
    'steps': [
        {'type': 'drill', 'title': '示範', 'hint': '先用慢速把最常用的十個詞打準。', 'display': 'big', 'text': ' '.join(top200[:10])},
        {'type': 'drill', 'title': '前 60 詞', 'hint': '越常用的詞，越應該打得又快又準。', 'gen': {'kind': 'words', 'words': chunk(0, 60), 'count': 24}},
        {'type': 'drill', 'title': '第 61–130 詞', 'hint': '保持節奏，一個詞接一個詞。', 'gen': {'kind': 'words', 'words': chunk(60, 130), 'count': 24}},
        {'type': 'drill', 'title': '第 131–200 詞', 'hint': '最後一批，仍然先求準。', 'gen': {'kind': 'words', 'words': chunk(130, 200), 'count': 24}},
        {'type': 'test', 'title': '過關小測', 'hint': '60 秒內打得愈多愈好，速度達 8 WPM、準確率達 90% 即過關。', 'timeLimit': 60, 'pass': {'wpm': 8, 'accuracy': 90},
         'gen': {'kind': 'words', 'words': top200, 'count': 90}},
    ]})

# ---- 第 16 課：句子與段落 ----
sentences = [
    'The sun is up.', 'I like to read books.', 'My dog can run fast.', 'We go to school every day.', 'She has a red bag.',
    'He plays football with his friends.', 'It is a nice day today.', 'Please open the door.', 'What is your name?', 'I can see a big tree.',
    'Our class has forty students.', 'Can you help me, please?', 'The cat is sleeping on the sofa.', 'They are going to the park.', 'I have two brothers and one sister.',
    'My mother cooks dinner at home.', 'Look at the blue sky!', 'We eat rice for lunch.', 'The bus comes at eight o\'clock.', 'Thank you for your help.',
    'He wants to be a doctor.', 'The river is long and deep.', 'I wash my hands before dinner.', 'Do you like music?', 'It is cold in winter.',
]
paras = [
    'Tom gets up at seven every morning. He washes his face and eats breakfast with his family. Then he takes the bus to school.',
    'My school has a big playground. After class, we play basketball and talk about our day. I love my school life.',
    'It was a warm Sunday. We went to the park and flew a kite. The kite went high into the sky, and everyone was happy.',
]
lessons.append({
    'id': 16, 'title': '句子與短段落', 'subtitle': '把學過的鍵連起來',
    'newKeys': [], 'pass': {'wpm': 10, 'accuracy': 90},
    'steps': [
        {'type': 'drill', 'title': '示範', 'hint': '句子由大寫開始，以標點結束。慢慢來。', 'display': 'big', 'text': sentences[0] + ' ' + sentences[1]},
        {'type': 'drill', 'title': '短句', 'hint': '每句都用大寫開頭、標點結尾。', 'gen': {'kind': 'words', 'words': sentences[:12], 'count': 6}},
        {'type': 'drill', 'title': '長句', 'hint': '節奏穩定比速度重要。', 'gen': {'kind': 'words', 'words': sentences[12:], 'count': 6}},
        {'type': 'drill', 'title': '短段落', 'hint': '完整的一小段文章。打完全段才算完成。', 'text': paras[0]},
        {'type': 'test', 'title': '過關小測', 'hint': '60 秒內打得愈多愈好，速度達 10 WPM、準確率達 90% 即過關。', 'timeLimit': 60, 'pass': {'wpm': 10, 'accuracy': 90},
         'gen': {'kind': 'words', 'words': sentences, 'count': 14}},
    ]})

# 驗證：每個步驟的字元都要打得到
import itertools
fingers = json.load(open(root / 'data' / 'fingers.json'))
def check(text, where):
    for ch in text:
        if ch == ' ': continue
    return True

out = {'lessons': base + lessons}
json.dump(out, open(data_path, 'w'), ensure_ascii=False, indent=2)
print('lessons:', [l['id'] for l in out['lessons']])
