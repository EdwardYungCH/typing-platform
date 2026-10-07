#!/usr/bin/env python3
"""產生 data/zh-codes.json（速成碼表、選字次序、倉頡全碼、常用字次序）。

來源（放在任何資料夾，作為參數傳入）：
  1. rime-ms-quick 的 ms_quick.dict.yaml —— 微軟速成（Windows 10/11）的碼和選字次序
  2. rime-cangjie 的 cangjie5.base.dict.yaml —— 倉頡五代全碼（LGPL-3.0），用來做拆字圖解
  3. rime-essay 的 essay.txt —— 詞頻（LGPL-3.0），用來排列常用字

用法：python3 tools/build_zh_codes.py ms_quick.dict.yaml cangjie5.base.dict.yaml essay.txt
"""
import json, sys, re
from collections import defaultdict

msq_path, cj_path, essay_path = sys.argv[1:4]

def read_table(path):
    rows, started = [], False
    for line in open(path, encoding='utf-8-sig'):
        line = line.rstrip('\n')
        if not started:
            if line.strip() == '...':
                started = True
            continue
        if not line or line.startswith('#'):
            continue
        parts = line.split('\t')
        if len(parts) >= 2:
            rows.append((parts[0], parts[1]))
    return rows

# 1. 速成：碼 -> 字串（保持微軟次序）
quick = defaultdict(list)
q_codes = defaultdict(list)
for ch, code in read_table(msq_path):
    if len(ch) != 1 or not re.fullmatch(r'[a-z]{1,2}', code):
        continue
    quick[code].append(ch)
    q_codes[ch].append(code)

# 2. 倉頡全碼：取首尾碼跟速成一致的那個
cj_all = defaultdict(list)
for ch, code in read_table(cj_path):
    if len(ch) == 1 and re.fullmatch(r'[a-y]{1,5}', code):
        cj_all[ch].append(code)

def qk(code):
    return code if len(code) == 1 else code[0] + code[-1]

# 一字多碼時，取能跟倉頡全碼對上的那個速成碼
cj_of, q_of, mismatch = {}, {}, 0
for ch, codes in q_codes.items():
    pair = next(((q, c) for q in codes for c in cj_all.get(ch, []) if qk(c) == q), None)
    if pair:
        q_of[ch], cj_of[ch] = pair
    else:
        q_of[ch] = codes[0]
        mismatch += 1

# 3. 字頻：把詞頻分到每個字（詞頻表部分用台灣字形，改為香港常用字形）
NORMAL = {'爲': '為', '僞': '偽', '眞': '真', '衆': '眾', '敎': '教', '吿': '告', '靑': '青', '淸': '清', '値': '值', '彥': '彦'}
freq = defaultdict(float)
for line in open(essay_path, encoding='utf-8'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) != 2:
        continue
    w, n = parts[0], float(parts[1] or 0)
    for ch in w:
        freq[NORMAL.get(ch, ch)] += n
common = [ch for ch in sorted(q_of, key=lambda c: -freq.get(c, 0)) if freq.get(ch, 0) > 0 and ch in cj_of]

first_code = {}
for code in sorted(quick):
    for ch in quick[code]:
        first_code.setdefault(ch, code)

out = {
    '_source': '速成碼與選字次序：rime-ms-quick（依 Windows 微軟速成）；倉頡全碼：rime-cangjie（LGPL-3.0）；字頻：rime-essay（LGPL-3.0）',
    # 一字多碼的字才需要寫明用哪個速成碼；其餘由 quick 反查（按碼排序後第一次出現）
    'qfix': {ch: q_of[ch] for ch in sorted(q_of) if q_of[ch] != first_code[ch]},
    'quick': {k: ''.join(v) for k, v in sorted(quick.items())},
    'cj': {ch: cj_of[ch] for ch in sorted(cj_of)},
    'common': ''.join(common[:3000]),
}
json.dump(out, open('data/zh-codes.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'速成碼 {len(quick)} 組、{len(q_of)} 字；有倉頡全碼 {len(cj_of)} 字；首尾碼不一致 {mismatch} 字；常用字 {len(common)}')
