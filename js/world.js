// 世界主題：英文 = 鍵帽星系（planet），中文 = 字根魔法學院（magic）。
// 頁面只要呼叫 applyWorld('planet' | 'magic')，顏色和背景就會整套切換。

export const WORLD_OF_LANG = { en: 'planet', zh: 'magic' };

export function applyWorld(world) {
  document.documentElement.dataset.world = world;
}

export function worldForLang(lang) {
  return WORLD_OF_LANG[lang] ?? 'planet';
}

// ---------- 回報問題（每頁右下角）----------
// 學生按一下就把頁面、課號和瀏覽器版本連同訊息送到教師後台；未登入也可以送。
function mountFeedback() {
  if (document.getElementById('fb-btn') || location.pathname.includes('/teacher/')) return;
  const b = document.createElement('button');
  b.id = 'fb-btn'; b.type = 'button'; b.className = 'fb-btn'; b.textContent = '回報問題'; b.setAttribute('aria-label', '回報問題');
  b.onclick = () => {
    const d = document.createElement('dialog');
    d.className = 'fb-dlg';
    d.innerHTML = `<form method="dialog"><h3>回報問題</h3><p class="muted">遇到卡住、顯示錯誤或拆碼圖標錯，寫幾句告訴老師。頁面和瀏覽器資料會自動附上。</p>
      <textarea id="fb-msg" rows="4" maxlength="1000" placeholder="例如：第 5 課組合一直不能按下一題" required></textarea>
      <p class="form-msg" id="fb-m"></p><div class="form-actions"><button class="btn primary" value="send">送出</button><button class="btn ghost" value="cancel" type="button" id="fb-cancel">取消</button></div></form>`;
    document.body.append(d); d.showModal();
    d.querySelector('#fb-cancel').onclick = () => d.close();
    d.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const msg = d.querySelector('#fb-msg').value.trim();
      const m = d.querySelector('#fb-m');
      try {
        const r = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: msg, page: location.pathname + location.search }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? '送出失敗');
        m.className = 'form-msg ok'; m.textContent = '已送出，謝謝！';
        setTimeout(() => d.close(), 900);
      } catch (err) { m.className = 'form-msg'; m.textContent = err.message === 'Failed to fetch' ? '現在連不上伺服器，請稍後再試。' : err.message; }
    };
    d.addEventListener('close', () => d.remove());
  };
  document.body.append(b);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFeedback); else mountFeedback();
