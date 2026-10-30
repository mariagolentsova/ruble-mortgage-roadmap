// «Кому отправить»: one Bot API copyMessage call per subscriber.
// The administrator's original message is copied as is (text, photo, formatting),
// with an «Отписаться» button under it.

const p = $('Разобрать апдейт').first().json;
const unsubscribe = { inline_keyboard: [[{ text: '🔕 Отписаться от новостей', callback_data: 'news_off' }]] };

const ids = [
  ...new Set(
    $input
      .all()
      .map((i) => i.json)
      .filter((r) => r.telegram_id && r.subscribed === true)
      .map((r) => String(r.telegram_id)),
  ),
];

// No subscribers: one empty item, so the report still goes out.
if (ids.length === 0) return [{ json: { none: true } }];

return ids.map((id) => ({
  json: {
    telegram_id: id,
    payload: { chat_id: id, from_chat_id: p.chatId, message_id: p.sourceMessageId, reply_markup: unsubscribe },
  },
}));
