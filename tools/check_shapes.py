#!/usr/bin/env python3
"""核對 data/zh-shapes.json：每個例字的倉頡碼，首碼（或尾碼）必須是該字形所屬的鍵。"""
import json, sys
Z = json.load(open('data/zh-codes.json', encoding='utf-8'))
S = json.load(open('data/zh-shapes.json', encoding='utf-8'))
bad = 0
for key, shapes in S['keys'].items():
    for sh in shapes:
        for ch in sh['examples']:
            cj = Z['cj'].get(ch)
            if not cj:
                print('沒有倉頡碼', key, sh['name'], ch); bad += 1; continue
            got = cj[0] if sh['pos'] == 'first' else cj[-1]
            if got != key:
                print('不符', key, sh['name'], ch, cj); bad += 1
print('問題', bad)
sys.exit(1 if bad else 0)
