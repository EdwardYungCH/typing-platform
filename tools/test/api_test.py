"""伺服器 API 自動測試：多校隔離、權限、評測、同步衝突、備份還原、保安檢查。

用法：先開本機伺服器（全新記憶體資料庫）
    node --experimental-sqlite tools/dev-server.mjs 8787
再執行
    python3 tools/test/api_test.py [http://localhost:8787]
全部通過會印「全部通過」；有失敗會列出並以非零狀態結束。
"""
import json
import sys
import time
import urllib.request
import urllib.error
import http.cookiejar

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8787'
FAILS = []
PASSES = 0


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method, path, body=None, headers=None, origin=True, raw=False):
        data = None
        h = {'content-type': 'application/json'} if body is not None else {}
        if origin:
            h['Origin'] = BASE
        h.update(headers or {})
        if body is not None:
            data = body if isinstance(body, (bytes, str)) else json.dumps(body)
            if isinstance(data, str):
                data = data.encode()
        req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
        try:
            r = self.op.open(req)
            status, text, rh = r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            status, text, rh = e.code, e.read(), e.headers
        if raw:
            return status, text, rh
        try:
            return status, json.loads(text)
        except Exception:
            return status, text.decode('utf-8', 'replace')

    def get(self, p, **k): return self.call('GET', p, **k)
    def post(self, p, b=None, **k): return self.call('POST', p, b if b is not None else {}, **k)
    def put(self, p, b, **k): return self.call('PUT', p, b, **k)
    def delete(self, p, b=None, **k): return self.call('DELETE', p, b if b is not None else {}, **k)


def check(name, cond, info=''):
    global PASSES
    if cond:
        PASSES += 1
    else:
        FAILS.append(f'{name}  {info}')
        print('✗', name, info)


def keys_for(text, gap=180):
    return [{'t': i * gap + 500, 'key': c} for i, c in enumerate(text)]


# ---------- 首次設定 ----------
owner = Client()
s, r = owner.post('/api/teacher/setup', {'schoolCode': 'alpha', 'schoolName': 'Alpha 中學', 'username': 'boss', 'password': 'bosspass1', 'name': '營運者'})
check('首次設定', s == 200, r)
s, r = owner.get('/api/teacher/status')
check('營運者身份', r['user']['isOwner'] and r['user']['school']['code'] == 'alpha', r)
s, r = owner.post('/api/teacher/setup', {'schoolCode': 'x', 'schoolName': 'x', 'username': 'xx1', 'password': 'xxxxxxxx', 'name': 'x'})
check('不可再次首次設定', s == 409, r)

# 跨站請求
s, r = owner.post('/api/teacher/classes', {'name': '1A', 'year': '2026-27'}, origin=False)
check('沒有 Origin 的寫入要拒絕', s == 403, r)
s, r = owner.post('/api/teacher/classes', {'name': '1A', 'year': '2026-27'}, headers={'Origin': 'https://evil.example'})
check('其他網站的寫入要拒絕', s == 403, r)

# ---------- 班級和學生 ----------
s, r = owner.post('/api/teacher/classes', {'name': '1a', 'year': '2026-27'})
check('開班', s == 200, r)
c1a = r['id']
s, r = owner.post('/api/teacher/classes', {'name': '中一甲', 'year': '2026-27'})
check('中文班名可以', s == 200, r)
c_zh = r['id']
s, r = owner.post('/api/teacher/classes', {'name': '1A', 'year': '2026-27'})
check('同學年同班名要拒絕', s == 409, r)
s, r = owner.post('/api/teacher/classes', {'name': '1<A>', 'year': '2026-27'})
check('班名有符號要拒絕', s == 400, r)

rows = [{'sid': f's{i:03d}', 'name': f'學生{i}', 'no': i} for i in range(1, 6)]
s, r = owner.post('/api/teacher/import', {'classId': c1a, 'rows': rows})
check('匯入 5 人', s == 200 and sum(1 for x in r['rows'] if x['status'] == '新增') == 5, r)
pw = {x['sid']: x['password'] for x in r['rows']}
s, r = owner.post('/api/teacher/import', {'classId': c1a, 'rows': [{'sid': f'x{i:03d}', 'name': 'x'} for i in range(51)]})
check('一次超過 50 人要拒絕', s == 400, r)
s, r = owner.get(f'/api/teacher/classes/{c1a}/slips')
check('紙條有學校代碼', s == 200 and r['school']['code'] == 'alpha' and len(r['students']) == 5, r)

# ---------- 學生登入（只有一間學校：不用學校代碼）----------
st1 = Client()
s, r = st1.get('/api/login-info')
check('只有一間學校', r['multi'] is False and r['school']['code'] == 'alpha', r)
s, r = st1.post('/api/login', {'sid': 'S001', 'password': pw['s001']})
check('學生登入（不填學校代碼）', s == 200 and r['user']['mustChange'] and r['user']['school']['name'] == 'Alpha 中學', r)
s, r = st1.post('/api/login', {'sid': 's001', 'password': 'wrong'})
check('密碼錯', s == 401, r)
cookie = [c for c in st1.jar if c.name == 'tp_s'][0]
check('不剔「記住我」= 關閉瀏覽器就登出', cookie.expires is None, cookie.expires)
st1r = Client()
s, r = st1r.post('/api/login', {'sid': 's001', 'password': pw['s001'], 'remember': True})
cookie = [c for c in st1r.jar if c.name == 'tp_s'][0]
check('剔「記住我」= 30 日', cookie.expires and cookie.expires - time.time() > 29 * 86400, cookie.expires)

# 改密碼：其他裝置登出
s, r = st1.post('/api/password', {'old': pw['s001'], 'password': 'newpass1'})
check('學生改密碼', s == 200, r)
s, r = st1r.get('/api/me')
check('改密碼後其他裝置登出', r['user'] is None, r)
s, r = st1.get('/api/me')
check('目前裝置仍登入', r['user'] and not r['user']['mustChange'], r)

# ---------- 第二間學校 ----------
s, r = owner.post('/api/owner/schools', {'schoolCode': 'beta', 'schoolName': 'Beta 書院', 'username': 'beta.admin', 'password': 'betapass1', 'name': 'B 管理員'})
check('營運者新增學校', s == 200, r)
beta_id = r['id']
s, r = owner.post('/api/owner/schools', {'schoolCode': 'beta', 'schoolName': 'dup', 'username': 'zz1', 'password': 'zzzzzzzz', 'name': 'z'})
check('學校代碼重複要拒絕', s == 409, r)
bad = Client()
s, r = bad.post('/api/teacher/login', {'username': 'beta.admin', 'password': 'betapass1'})
s, r = bad.get('/api/owner/schools')
check('學校管理員不可用營運者功能', s == 403, r)

badm = bad
s, r = badm.post('/api/teacher/classes', {'name': '1A', 'year': '2026-27'})
check('第二間學校可以有同名班', s == 200, r)
b1a = r['id']
s, r = badm.post('/api/teacher/import', {'classId': b1a, 'rows': [{'sid': 's001', 'name': 'Beta 學生一', 'no': 1}]})
check('第二間學校可以有同一學號', s == 200 and r['rows'][0]['status'] == '新增', r)
bpw = r['rows'][0]['password']

# 學校隔離
s, r = badm.get(f'/api/teacher/classes/{c1a}/students')
check('看不到其他學校的班', s == 403, r)
s, r = badm.post('/api/teacher/import', {'classId': c1a, 'rows': [{'sid': 's002', 'name': 'hack'}]})
check('不可匯入到其他學校的班', s == 400, r)
s, r = badm.get('/api/teacher/classes')
check('班級列表只有自己學校', [c['id'] for c in r['classes']] == [b1a], r)
s, r = badm.get('/api/teacher/teachers')
check('教師名單只有自己學校', [t['username'] for t in r['teachers']] == ['beta.admin'], r)

# 多校之後學生登入要學校代碼
st2 = Client()
s, r = st2.get('/api/login-info')
check('多間學校', r['multi'] is True and r['school'] is None, r)
s, r = st2.post('/api/login', {'sid': 's001', 'password': bpw})
check('多校時沒有學校代碼要提示', s == 400 and '學校代碼' in r['error'], r)
s, r = st2.post('/api/login', {'school': 'BETA', 'sid': 's001', 'password': bpw})
check('Beta 學生登入', s == 200 and r['user']['name'] == 'Beta 學生一', r)
s, r = st2.post('/api/login', {'school': 'alpha', 'sid': 's001', 'password': bpw})
check('同學號不同學校密碼分開', s == 401, r)
s, r = st2.get('/api/login-info?school=nope')
check('不存在的學校代碼', r['unknown'] is True, r)

# ---------- C1：一般老師不可以用匯入搶走別班學生 ----------
s, r = owner.post('/api/teacher/add', {'username': 'chan', 'password': 'chanpass1', 'name': '陳老師'})
check('新增老師', s == 200, r)
chan = Client()
chan.post('/api/teacher/login', {'username': 'chan', 'password': 'chanpass1'})
s, r = chan.post('/api/teacher/classes', {'name': '2B', 'year': '2026-27'})
c2b = r['id']
s, r = chan.post('/api/teacher/import', {'classId': c2b, 'rows': [{'sid': 's002', 'name': '搶人'}]})
check('C1 不可搶別班學生', s == 200 and r['rows'][0].get('error'), r)
s, r = owner.get(f'/api/teacher/classes/{c1a}/students')
check('C1 學生仍在原班', any(x['sid'] == 's002' and x['name'] == '學生2' for x in r['students']), r)
s, r = chan.get(f'/api/teacher/classes/{c1a}/students')
check('老師看不到別人的班', s == 403, r)

# ---------- 進度同步：摘要清洗、衝突 ----------
evil = {'store': {'lessons': {'__proto__': {'done': True}, '__proto__:1': {'done': True}, 'en:1': {'done': True, 'stars': '<img src=x onerror=alert(1)>', 'bestWpm': '<script>'},
                              'en:2': {'done': True, 'stars': 3, 'bestWpm': 25.5}},
                  'attempts': [{'at': '2026-11-01T10:00:00.000Z', 'seconds': 120}, {'at': '<b>', 'seconds': '9e99'}],
                  'settings': {'wallet': {'equip': {'title': '<svg onload=1>'}}}},
         'daily': {'en': {'streak': '<x>'}}, 'evil': {'a': 1}}
s, r = st1.put('/api/progress', evil)
check('上載進度', s == 200, r)
base = r['updatedAt']
s, r = owner.get(f'/api/teacher/classes/{c1a}/students')
summ = [x for x in r['students'] if x['sid'] == 's001'][0]['summary']
check('摘要只有數字（防 XSS）', summ['en']['stars'] == 3 and summ['en']['bestWpm'] == 25.5 and summ['en']['lessons'] == 2 and summ['title'] is None and summ['streak']['en'] == 0, summ)
check('摘要不受 __proto__ 影響', summ['done'] == ['en:1', 'en:2'], summ['done'])
s, r = st1.get('/api/progress')
check('不接受的欄位被移除', 'evil' not in r['data'], list(r['data'].keys()))

s, r = st1.put('/api/progress', {'store': {'lessons': {}}}, headers={'x-base': 'old-version'})
check('舊版本上載要退回 409 讓瀏覽器合併', s == 409 and r['conflict'] and r['data']['store']['lessons'].get('en:2'), s)
s, r = st1.put('/api/progress', {'store': {'lessons': {'en:2': {'done': True, 'stars': 3}}}}, headers={'x-base': base})
check('同一版本上載成功', s == 200, r)
s, r = st1.put('/api/progress', [1, 2])
check('進度要是物件', s == 400, r)

# ---------- 排行榜：只讀摘要 ----------
s, r = st1.get('/api/leaderboard')
check('排行榜', s == 200 and r['enabled'] and any(x['stars'] == 3 for x in r['students']), r)

# ---------- 評測 ----------
s, r = st1.post('/api/test/start', {'testId': 'en-s1'})
check('開始評測', s == 200 and r['restarts'] == 0, r)
s, r = st1.post('/api/test/start', {'testId': 'en-s1'})
check('重新開始第 1 次', s == 200 and r['restarts'] == 1, r)
s, r = st1.post('/api/test/start', {'testId': 'en-s1'})
check('重新開始第 2 次', s == 200 and r['restarts'] == 2, r)
att, text = r['attemptId'], r['text']
s, r = st1.post('/api/test/start', {'testId': 'en-s1'})
check('第 4 次開始要找老師', s == 409, r)
s, r = st1.post('/api/test/submit', {'attemptId': att, 'keystrokes': keys_for(text[:60]), 'client': {'wpm': '<b>', 'accuracy': 100}})
check('交卷', s == 200 and 'restart-2' in r['result']['flags'], r)
s, r = st1.post('/api/test/submit', {'attemptId': att, 'keystrokes': keys_for(text[:60])})
check('不可交卷兩次', s == 409, r)
s, r = st1.post('/api/test/start', {'testId': 'en-s2'})
att2, text2 = r['attemptId'], r['text']
ks = keys_for(text2[:80])
ks[10]['t'] = 1
s, r = st1.post('/api/test/submit', {'attemptId': att2, 'keystrokes': ks})
check('按鍵時間倒退要標記', 'non-monotonic' in r['result']['flags'], r)
s, r = owner.post(f'/api/teacher/students/{[x for x in owner.get(f"/api/teacher/classes/{c1a}/students")[1]["students"] if x["sid"] == "s001"][0]["id"]}/retake', {'testId': 'en-s1'})
check('老師重開評測', s == 200, r)

# 評測時段
s, r = owner.post('/api/teacher/school', {'name': 'Alpha 中學', 'settings': {'testsNeedWindow': True}})
check('學校設定：評測要老師開放', s == 200 and r['school']['settings']['testsNeedWindow'], r)
s, r = st1.post('/api/test/start', {'testId': 'en-s1'})
check('未開放時不可開始', s == 403, r)
now = time.time()
iso = lambda t: time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(t))
s, r = owner.post(f'/api/teacher/classes/{c1a}/windows', {'testId': 'en-s1', 'opens': iso(now - 60), 'closes': iso(now + 3600)})
check('開放評測時段', s == 200, r)
s, r = st1.get('/api/test/results')
check('學生看到開放中的評測', r['needWindow'] and r['windows'].get('en-s1', {}).get('open'), r)
s, r = st1.post('/api/test/start', {'testId': 'en-s1'})
check('時段內可以開始', s == 200, r)
s, r = owner.get(f'/api/teacher/classes/{c1a}/windows')
wid = r['windows'][0]['id']
s, r = owner.delete(f'/api/teacher/windows/{wid}')
s, r = st1.post('/api/test/start', {'testId': 'zh-s1'})
check('其他評測仍未開放', s == 403, r)
s, r = chan.post(f'/api/teacher/classes/{c1a}/windows', {'testId': 'en-s1', 'opens': iso(now), 'closes': iso(now + 60)})
check('不可替別人的班開評測', s == 403, r)
owner.post('/api/teacher/school', {'name': 'Alpha 中學', 'settings': {'testsNeedWindow': False}})

# 全級成績
s, r = owner.get('/api/teacher/form?year=2026-27&form=1&test=en-s2')
check('全級成績', s == 200 and r['total'] >= 5 and len(r['form']) == 1, r)

# ---------- 問題回報 ----------
anon = Client()
s, r = anon.post('/api/feedback', {'message': '有問題啊'})
check('未登入不可回報', s == 401, r)
for i in range(5):
    s, r = st1.post('/api/feedback', {'message': f'問題 {i}', 'page': 'x'})
check('登入可以回報', s == 200, r)
s, r = st1.post('/api/feedback', {'message': '第六次'})
check('一小時最多 5 次', s == 429, r)
s, r = badm.get('/api/teacher/feedback')
check('其他學校看不到回報', s == 200 and not r['feedback'], r)
s, r = owner.get('/api/teacher/feedback')
check('本校管理員看到回報', len(r['feedback']) == 5, len(r['feedback']))

# ---------- 備份和還原 ----------
s, text, h = owner.call('GET', '/api/teacher/backup', raw=True)
backup = json.loads(text)
check('下載備份', s == 200 and backup['version'] == 2 and backup['school']['code'] == 'alpha', s)
check('備份只有本校', all(t['username'] != 'beta.admin' for t in backup['tables']['teachers']) and len(backup['tables']['students']) == 5, [t['username'] for t in backup['tables']['teachers']])
check('備份沒有初始密碼', all(x['initial_pw'] in (None, '') for x in backup['tables']['students']), [x['initial_pw'] for x in backup['tables']['students']])
s, r = badm.post('/api/teacher/restore', {'confirm': '還原', 'backup': backup})
check('不可把別校備份還原到本校', s == 400 and '另一間學校' in r['error'], r)
evil_b = json.loads(json.dumps(backup))
evil_b['school']['code'] = 'beta'
evil_b['tables']['progress'].append({'student_id': 999999, 'data': '{}'})
s, r = badm.post('/api/teacher/restore', {'confirm': '還原', 'backup': evil_b})
check('還原檢查編號', s == 400, r)
# 刪一個學生再還原
sid5 = [x for x in owner.get(f'/api/teacher/classes/{c1a}/students')[1]['students'] if x['sid'] == 's005'][0]['id']
owner.delete(f'/api/teacher/students/{sid5}')
s, r = owner.post('/api/teacher/restore', {'confirm': '還原', 'backup': backup})
check('還原', s == 200 and r['counts']['students'] == 5, r)
owner = Client()
owner.post('/api/teacher/login', {'username': 'boss', 'password': 'bosspass1'})
s, r = owner.get('/api/teacher/status')
check('還原後仍是營運者', r['user']['isOwner'], r)
s, r = owner.get(f'/api/teacher/classes/{c1a}/students')
check('還原後學生回來了', len(r['students']) == 5, len(r['students']))
s, r = owner.get(f'/api/teacher/classes/{c1a}/slips')
check('還原後未改密碼的學生紙條顯示空白', [x['initial_pw'] for x in r['students'] if x['sid'] == 's002'] == [''], r)
s, r = st1.get('/api/me')
check('還原後本校學生要重新登入', r['user'] is None, r)
s, r = st1.post('/api/login', {'school': 'alpha', 'sid': 's001', 'password': 'newpass1'})
check('還原後重新登入', s == 200, r)
s, r = st2.get('/api/me')
check('還原不影響其他學校的學生', r['user'] and r['user']['name'] == 'Beta 學生一', r)

# 雲端備份
s, r = owner.post('/api/teacher/backup/cloud')
check('雲端備份', s == 200 and r['key'].startswith('typing-backup-alpha-'), r)
s, r = owner.get('/api/teacher/backup/cloud')
check('雲端備份列表', r['enabled'] and len(r['files']) == 1, r)
s, r = badm.get('/api/teacher/backup/cloud')
check('其他學校看不到本校雲端備份', r['files'] == [], r)

# ---------- 升班、畢業 ----------
s, r = owner.post('/api/teacher/classes', {'name': '2A', 'year': '2027-28'})
c2a = r['id']
s, r = owner.post(f'/api/teacher/classes/{c1a}/move', {'toClassId': c2a})
check('全班升班', s == 200 and r['moved'] == 5, r)
s, r = st1.get('/api/me')
check('學生升班後班別更新', r['user']['className'] == '2A', r)
s, r = owner.delete(f'/api/teacher/classes/{c2a}')
check('有學生的班不可直接刪', s == 400, r)
s, r = owner.delete(f'/api/teacher/classes/{c2a}', {'purge': True, 'confirm': '2X'})
check('刪班要輸入班名', s == 400, r)
s, r = owner.delete(f'/api/teacher/classes/{c2a}', {'purge': True, 'confirm': '2a'})
check('畢業：連學生一起刪', s == 200 and r['deletedStudents'] == 5, r)
s, r = st1.get('/api/me')
check('刪除後學生已登出', r['user'] is None, r)

# ---------- 停用和刪除學校 ----------
s, r = owner.post(f'/api/owner/schools/{beta_id}', {'active': False})
check('停用學校', s == 200, r)
s, r = st2.get('/api/me')
check('停用後學生登出', r['user'] is None, r)
s, r = Client().post('/api/teacher/login', {'username': 'beta.admin', 'password': 'betapass1'})
check('停用後老師不能登入', s == 403, r)
s, r = owner.delete(f'/api/owner/schools/{beta_id}', {'confirm': 'wrong'})
check('刪校要輸入代碼', s == 400, r)
s, r = owner.delete(f'/api/owner/schools/{beta_id}', {'confirm': 'beta'})
check('刪除學校', s == 200 and r['deletedStudents'] == 1, r)
s, r = owner.get('/api/owner/schools')
check('學校列表', [x['code'] for x in r['schools']] == ['alpha'], r)

# ---------- 登入鎖 ----------
lk = Client()
for i in range(8):
    lk.post('/api/teacher/login', {'username': 'chan', 'password': 'bad'})
s, r = lk.post('/api/teacher/login', {'username': 'chan', 'password': 'chanpass1'})
check('老師帳號在同一網絡輸錯 8 次要鎖', s == 429, r)
s, r = owner.post(f'/api/teacher/teachers/{[t for t in owner.get("/api/teacher/teachers")[1]["teachers"] if t["username"] == "chan"][0]["id"]}/reset', {'password': 'chanpass2'})
s, r = lk.post('/api/teacher/login', {'username': 'chan', 'password': 'chanpass2'})
check('管理員重設密碼後解鎖', s == 200, r)

# 伺服器錯誤不洩露內部資料
s, r = anon.get('/api/nope')
check('不存在的 API', s in (401, 404) and '伺服器' not in str(r), r)

print(f'\n通過 {PASSES} 項，失敗 {len(FAILS)} 項')
if FAILS:
    for f in FAILS:
        print(' -', f)
    sys.exit(1)
print('全部通過')
