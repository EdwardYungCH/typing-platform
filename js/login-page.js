import { login, currentUser } from './sync.js';

const $ = (id) => document.getElementById(id);
const next = new URLSearchParams(location.search).get('next') || 'index.html';
if (!/^[a-z][\w./?=&-]*$/i.test(next) || next.includes('//')) location.replace('index.html');

currentUser({ refresh: true }).then((u) => { if (u) location.replace(next); });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('msg').textContent = '';
  $('go').disabled = true;
  try {
    const user = await login($('sid').value.trim(), $('pw').value);
    $('msg').className = 'form-msg ok';
    $('msg').textContent = `歡迎，${user.name}！`;
    location.href = user.mustChange ? `me.html?first=1&next=${encodeURIComponent(next)}` : next;
  } catch (err) {
    $('msg').className = 'form-msg';
    $('msg').textContent = err.message;
    $('go').disabled = false;
  }
});
