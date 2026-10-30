// «Подписка: строка»: one news_subscribers row per Telegram user.
// news_on  — the user pressed «🔔 Получать новости» (or /news): this is the consent to mailings, its time is kept;
// news_off — the user unsubscribed (button under a broadcast or /stopnews).

const p = $('Разобрать апдейт').first().json;
const u = p.user;
if (!u || !u.id) return [];

const clip = (s, n) => String(s ?? '').slice(0, n);
const now = new Date().toISOString();

const row = {
  telegram_id: String(u.id),
  username: clip(u.username, 64),
  first_name: clip(u.first_name, 128),
  subscribed: p.action === 'news_on',
};
if (p.action === 'news_on') row.subscribed_at = now;
else {
  row.unsubscribed_at = now;
  row.unsubscribe_reason = 'user';
}

return [{ json: row }];
