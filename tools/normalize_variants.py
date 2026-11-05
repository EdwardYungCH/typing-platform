#!/usr/bin/env python3
"""把常用字表和題目裏的異體字，換成微軟速成較易選到的寫法（香港電腦常用的 Big5 字形）。

原因：例如「着」在微軟速成要翻 6 頁（第 57 個候選字），「著」是第 5 個；學生在真實輸入法自然會打「著」。
課程、評測、每日任務都用同一套寫法，學生不會因為選了常見寫法而被判錯。
用法：python3 tools/normalize_variants.py（改過 build_zh_codes.py 或題目後再跑一次；之後再跑 gen_zh_lessons.py）
"""
import json, re

VARIANTS = {'着': '著', '裏': '裡', '麪': '麵', '羣': '群', '峯': '峰', '啓': '啟', '牀': '床', '衆': '眾', '爲': '為', '温': '溫', '綫': '線', '衞': '衛', '鷄': '雞'}
tr = str.maketrans(VARIANTS)

z = json.load(open('data/zh-codes.json', encoding='utf-8'))
seen, out = set(), []
for c in z['common'].translate(tr):
    if c not in seen: seen.add(c); out.append(c)
changed = z['common'] != ''.join(out)
z['common'] = ''.join(out)
z['_variants'] = '常用字表已把這些異體字換成微軟速成較易選到的寫法：' + '、'.join(f'{a}→{b}' for a, b in VARIANTS.items())
json.dump(z, open('data/zh-codes.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

t = json.load(open('data/tests.json', encoding='utf-8'))
for x in t['tests']:
    if x['lang'] == 'zh':
        x['text'] = x['text'].translate(tr)
        x['forms'] = [f.translate(tr) for f in x.get('forms', [])]
json.dump(t, open('data/tests.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('常用字表', '已更新' if changed else '不變', '；評測題目已檢查')
