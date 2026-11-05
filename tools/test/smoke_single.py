"""單校版本伺服器冒煙測試：教師設定、匯入、學生登入（記住我）、進度摘要清洗、評測、匯出。
用法：node --experimental-sqlite tools/dev-server.mjs 8787（全新記憶體資料庫），再 python3 tools/test/smoke_single.py http://localhost:8787"""
import json, sys, time, urllib.request, urllib.error, http.cookiejar
B = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8787'
FAILS = []; N = [0]
class C:
    def __init__(s): s.jar = http.cookiejar.CookieJar(); s.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(s.jar))
    def call(s, m, p, b=None, raw=False):
        h = {'Origin': B}; d = None
        if b is not None: h['content-type'] = 'application/json'; d = json.dumps(b).encode()
        try: r = s.op.open(urllib.request.Request(B + p, data=d, method=m, headers=h)); st, t = r.status, r.read()
        except urllib.error.HTTPError as e: st, t = e.code, e.read()
        if raw: return st, t
        try: return st, json.loads(t)
        except Exception: return st, t
def check(name, ok, info=''):
    N[0] += 1
    if not ok: FAILS.append(name); print('✗', name, info)
t = C()
s, r = t.call('POST', '/api/teacher/setup', {'username': 'chan', 'name': '陳老師', 'password': 'teacher123'}); check('老師設定', s == 200, r)
s, r = t.call('POST', '/api/teacher/classes', {'name': '1A', 'year': '2026-27'}); cid = r['id']
s, r = t.call('POST', '/api/teacher/import', {'classId': cid, 'rows': [{'sid': 's001', 'name': '甲', 'no': 1}, {'sid': 's002', 'name': '乙', 'no': 2}]})
pw = {x['sid']: x['password'] for x in r['rows']}; check('匯入', len(pw) == 2, r)
a = C(); s, r = a.call('POST', '/api/login', {'sid': 's001', 'password': pw['s001']})
ck = [c for c in a.jar if c.name == 'tp_s'][0]; check('不剔記住我：關閉瀏覽器就登出', s == 200 and ck.expires is None, ck.expires)
b = C(); b.call('POST', '/api/login', {'sid': 's001', 'password': pw['s001'], 'remember': True})
ck = [c for c in b.jar if c.name == 'tp_s'][0]; check('剔記住我：30 日', ck.expires and ck.expires - time.time() > 29 * 86400, ck.expires)
s, r = a.call('POST', '/api/password', {'old': pw['s001'], 'password': 'newpass1'}); check('改密碼', s == 200, r)
s, r = b.call('GET', '/api/me'); check('改密碼後其他裝置登出', r.get('user') is None, r)
evil = {'store': {'lessons': {'en:1': {'done': True, 'stars': '<img src=x onerror=alert(1)>', 'bestWpm': '<b>'}, '__proto__': {'done': True}},
                  'attempts': [{'at': '<x>', 'seconds': 'abc'}], 'settings': {'wallet': {'equip': {'title': '<svg>'}}}}}
s, r = a.call('PUT', '/api/progress', evil); check('上載進度', s == 200, r)
s, r = t.call('GET', f'/api/teacher/classes/{cid}/students')
sm = [x for x in r['students'] if x['sid'] == 's001'][0]['summary']
check('摘要只有數字', sm['en']['stars'] == 0 and sm['en']['bestWpm'] == 0 and sm['lastActive'] is None and sm['done'] == ['en:1'], sm)
s, r = a.call('GET', '/api/leaderboard'); check('排行榜沒有塞入的字串', s == 200 and all(x['title'] is None for x in r['students']), r)
tests = json.load(open('data/tests.json'))['tests']; en1 = [x for x in tests if x['id'] == 'en-s1'][0]
s, r = a.call('POST', '/api/test/start', {'testId': 'en-s1'}); check('正式評測不用公開的第一份題目', s == 200 and r['text'] in en1['forms'][1:], r.get('text', '')[:40])
txt = r['text']; ks = [{'t': 500 + i * 170, 'key': c} for i, c in enumerate(txt[:80])]
s, r = a.call('POST', '/api/test/submit', {'attemptId': r['attemptId'], 'keystrokes': ks, 'client': {'wpm': '<b>', 'accuracy': 99}}); check('交卷', s == 200 and r['result']['wpm'] > 0, r)
sid1 = [x for x in t.call('GET', f'/api/teacher/classes/{cid}/students')[1]['students'] if x['sid'] == 's001'][0]['id']
s, raw = t.call('GET', f'/api/teacher/students/{sid1}/export', raw=True); d = json.loads(raw); check('匯出個人資料', s == 200 and d['student']['sid'] == 's001' and len(d['tests']) == 1, s)
s, raw = t.call('GET', f'/api/teacher/classes/{cid}/export.csv', raw=True); check('匯出 CSV', s == 200 and '甲'.encode() in raw, s)
s, r = t.call('POST', f'/api/teacher/classes/{cid}/assignments', {'lang': 'en', 'lessonId': 17}); check('可以派第 17 課', s == 200, r)
s, r = C().call('GET', '/api/nope'); check('錯誤訊息不洩露內部', s in (401, 404) and '伺服器錯誤' not in str(r), r)
print(f'通過 {N[0] - len(FAILS)} 項，失敗 {len(FAILS)} 項'); sys.exit(1 if FAILS else 0)
