#!/usr/bin/env python3
"""為字根表圖片中每個輔助字形選 3 個例字（以顏色標出該字形位置）。
來源：tools/out/components.json（build_zh_glyphs.py 產生：哪個字的首／尾碼是由哪個部件構成）。
MAP 把每張字形圖對應到拆字資料中的部件；FILTER 可再限制例字（例如只要左邊部首）。
輸出寫入 data/zh-shapes.json 的 "chartInfo"。"""
import json
C = json.load(open('tools/out/components.json', encoding='utf-8'))
Z = json.load(open('data/zh-codes.json', encoding='utf-8'))
D = {}
for line in open('/home/claude/src/makemeahanzi/dictionary.txt', encoding='utf-8'):
    o = json.loads(line); D[o['character']] = o
rank = {c: i for i, c in enumerate(Z['common'])}
EXCLUDE = set('縣臺黨爾呵喫')

# 字形圖 → (部件, 名稱, 只收首碼/尾碼/不限, 額外條件)
MAP = {
    'a-0': ('曰', '扁日', None, None),
    'b-0': ('冂', '同字框', None, None), 'b-1': ('冖', '冧寶蓋', None, None), 'b-3': ('爫', '爪字頭', None, None),
    'c-0': ('丷', '兩點', None, None), 'c-1': ('八', '八字', None, None),
    'e-0': ('氵', '三點水', None, None), 'e-1': ('又', '又字', None, None), 'e-2': ('水', '水字底', 'l', None),
    'f-0': ('灬', '四點火', None, None), 'f-1': ('⺌', '小字頭', None, None), 'f-2': ('小', '小字', 'l', None),
    'g-0': ('土', '提土旁', 'f', '⿰'), 'g-1': ('士', '士字', None, None),
    'h-0': ('丿', '撇', 'f', None), 'h-1': ('⺮', '竹字頭（左半）', 'f', None),
    'i-0': ('丶', '點', None, None), 'i-1': ('厶', '私字邊', None, None), 'i-2': ('广', '廣字頭', None, None),
    'j-0': ('宀', '寶蓋頭', None, None),
    'k-0': ('？', '左字頭（橫、撇）', 'f', None), 'k-1': ('犭', '狗爪邊', None, None), 'k-2': ('乂', '交叉', None, None), 'k-3': ('疒', '病字頭', None, None),
    'l-0': ('丨', '豎', None, None), 'l-3': ('衤', '衣字邊', None, None),
    'm-1': ('工', '工字', None, None), 'm-2': ('厂', '廠字頭', None, None),
    'n-0': ('乛', '橫鈎', None, None), 'n-1': ('亅', '豎鈎', 'l', None), 'n-2': ('⺈', '刀字頭', None, None),
    'n-3': ('夕', '夕字（少一點）', 'f', None), 'n-6': ('乙', '乙字', None, None),
    'o-0': ('亻', '企人邊', None, None), 'o-2': ('人', '人字頭', 'f', None),
    'p-0': ('忄', '豎心邊', None, None), 'p-1': ('⺗', '心字底', None, None), 'p-2': ('勹', '包字頭', None, None),
    'p-3': ('匕', '匕字', None, None), 'p-4': ('七', '七字', None, None),
    'q-0': ('扌', '剔手邊', None, None), 'q-1': ('龶', '青字頭', None, None),
    'r-0': ('口', '口字', None, None),
    's-1': ('匚', '匚字框', None, None),
    't-0': ('艹', '草花頭', None, None), 't-3': ('廿', '廿字', None, None),
    'u-1': ('凵', '凵字', None, None), 'u-2': ('乚', '豎彎鈎', None, None),
    'v-0': ('幺', '絲字邊（撇折）', None, None),
    'w-0': ('囗', '大口框', None, None),
    'y-0': ('卜', '卜字', None, None), 'y-1': ('亠', '點橫頭', None, None), 'y-2': ('辶', '走字底', None, None),
}
# 拆字資料中部件標為「？」的字：人手看過圖後，逐個指定屬哪張字形圖（字, 首/尾）
MANUAL = {
    'c-0': ('兩點', [('曾', 'f')]),
    's-0': ('尸字變形（橫折、橫）', [('刀', 'f'), ('己', 'f')]),
    'v-4': ('衣字底', [('畏', 'l')]),
    'p-1': ('心字底', [('添', 'l'), ('慕', 'l'), ('恭', 'l')]),
}
info = {}
for img, (comp, name, side, op) in MAP.items():
    key = img[0]
    cands = [(c, sd) for c, sd in C.get(f'{key}|{comp}', []) if c not in EXCLUDE and (side is None or sd == side)]
    if op:
        cands = [(c, sd) for c, sd in cands if D.get(c, {}).get('decomposition', '').startswith(op)]
    cands.sort(key=lambda x: rank.get(x[0], 99999))
    seen, ex = set(), []
    for c, sd in cands:
        if c in seen: continue
        seen.add(c); ex.append([c, sd])
        if len(ex) == 3: break
    info[img] = {'name': name, 'examples': ex}
import os
for img, (name, lst) in MANUAL.items():
    ex = [[c, sd] for c, sd in lst if os.path.exists(f'assets/glyphs/{ord(c):x}.json')]
    have = info.get(img, {}).get('examples', [])
    merged = have + [e for e in ex if e[0] not in {h[0] for h in have}]
    info[img] = {'name': info.get(img, {}).get('name', name), 'examples': merged[:3]}
# 沒有可靠筆畫資料的字形：用倉頡碼顯示字形所在位置（字, 倉頡碼第幾碼，0 起計），由下面自動核對
TEXT = {
    'b-2': ('月字變形（夕字頭）', [('然', 0), ('祭', 0), ('將', 2)]),
    'c-2': ('八字變形（撇、豎彎）', [('亦', 3), ('赤', 3)]),
    'd-0': ('寸字（不計點）', [('寸', 0), ('時', 2), ('對', 2)]),
    'l-1': ('豎撇', [('川', 0), ('介', 2), ('片', 0)]),
    'l-2': ('聿字頭', [('書', 0), ('畫', 0), ('建', 2)]),
    'm-0': ('提', [('次', 1), ('冷', 1), ('冰', 1)]),
    'm-3': ('橫、撇', [('面', 0), ('不', 0), ('百', 0)]),
    'n-5': ('橫折彎鈎', [('九', 1), ('凡', 1), ('風', 1)]),
    'o-1': ('人字變形（捺變橫）', [('乞', 0), ('每', 0), ('午', 0)]),
    'o-4': ('捺', [('是', 3), ('之', 2), ('足', 2)]),
    'p-5': ('也字頭（斜鈎加橫）', [('也', 0), ('他', 1), ('地', 1)]),
    'q-2': ('手字頭（兩橫一撇）', [('春', 0), ('奏', 0), ('秦', 0)]),
    's-2': ('橫折鈎', [('司', 0), ('局', 1), ('習', 0)]),
    't-1': ('廾字', [('開', 3), ('弄', 2), ('算', 3)]),
    't-2': ('並字頭（兩點加一橫）', [('美', 0), ('前', 0), ('首', 0)]),
    't-4': ('业字頭', [('業', 0), ('對', 0), ('叢', 0)]),
    't-5': ('曲字頭', [('曹', 0), ('曲', 0), ('典', 0)]),
    'u-0': ('山字變形', [('豈', 0), ('凱', 0), ('微', 2)]),
    'v-1': ('豎折', [('亡', 1), ('忘', 1), ('喪', 3)]),
    'v-2': ('豎提', [('以', 0), ('收', 0), ('長', 2)]),
    'w-1': ('母字框', [('母', 0), ('每', 1), ('貫', 0)]),
    'y-3': ('兩點', [('於', 3), ('冬', 2), ('寒', 3)]),
}
for img, (name, lst) in TEXT.items():
    k = img[0]
    good = [[c, p] for c, p in lst if Z['cj'].get(c, '')[p:p + 1] == k]
    assert len(good) == len(lst), (img, lst)
    entry = info.setdefault(img, {'name': name, 'examples': []})
    entry['text'] = good
S = json.load(open('data/zh-shapes.json', encoding='utf-8'))
S['chartInfo'] = info
json.dump(S, open('data/zh-shapes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
short = [k for k, v in info.items() if len(v['examples']) < 3]
print('有例字的字形', len(info), '；不足 3 個例字：', short)
