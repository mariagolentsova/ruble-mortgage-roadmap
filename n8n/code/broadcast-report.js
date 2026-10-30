// «Итоги рассылки»: counts deliveries, finds people who blocked the bot, prepares the report.
// Telegram answers 403 when the user blocked the bot or deleted the account: they are unsubscribed.

const p = $('Разобрать апдейт').first().json;
const targets = $('Кому отправить').all().map((i) => i.json);
const results = $('Разослать').isExecuted ? $('Разослать').all().map((i) => i.json) : [];

let delivered = 0;
const blocked = [];
const failed = [];
targets.forEach((t, i) => {
  if (t.none) return;
  const r = results[i] ?? {};
  const body = typeof r.body === 'object' && r.body ? r.body : {};
  if (r.statusCode === 200 && body.ok) delivered += 1;
  else if (r.statusCode === 403) blocked.push(t.telegram_id);
  else failed.push(`${t.telegram_id}: ${body.description ?? r.statusCode ?? r.error?.message ?? 'нет ответа'}`);
});
const total = targets.filter((t) => !t.none).length;

let text;
if (total === 0) {
  text = 'Подписчиков пока нет — рассылка никому не отправлена.';
} else {
  text = `📣 Рассылка отправлена\n\nПодписчиков: ${total}\nДоставлено: ${delivered}`;
  if (blocked.length) text += `\nЗаблокировали бота: ${blocked.length} (они отписаны)`;
  if (failed.length) text += `\nНе доставлено по другим причинам: ${failed.length}`;
}

return [
  {
    json: {
      report: { chat_id: p.chatId, text },
      log: {
        source_message_id: String(p.sourceMessageId),
        recipients: total,
        delivered,
        blocked: blocked.length,
        failed: failed.length,
        errors: failed.slice(0, 20).join('\n'),
        finished_at: new Date().toISOString(),
      },
      blocked,
    },
  },
];
