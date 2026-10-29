// «Карточка пользователя»: one bot_users row per Telegram user, refreshed on every message.
// Only what Telegram itself sends with an update; phone numbers are not requested.
// The table's own createdAt column = first visit, updatedAt = last activity.

const p = $('Разобрать апдейт').first().json;
const u = p.user;
if (!u || !u.id) return [];

const clip = (s, n) => String(s ?? '').slice(0, n);

return [
  {
    json: {
      telegram_id: String(u.id),
      username: clip(u.username, 64),
      profile_link: u.username ? `https://t.me/${clip(u.username, 64)}` : '',
      first_name: clip(u.first_name, 128),
      last_name: clip(u.last_name, 128),
      last_action: p.action,
      last_seen_at: new Date().toISOString(),
    },
  },
];
