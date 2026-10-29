// «Разобрать апдейт»: turns a Telegram update into one action for the bot.
// Only private chats are answered; anything else produces no items and the run stops.

const MENU_CALC = '🧮 Калькулятор';
const MENU_ASK = '💬 Задать вопрос';

const update = $input.first().json;
let chatId = null;
let chatType = 'private';
let firstName = '';
let callbackId = null;
let action = 'unknown';
let from = null;

if (update.callback_query) {
  const cq = update.callback_query;
  chatId = cq.message?.chat?.id ?? cq.from?.id ?? null;
  chatType = cq.message?.chat?.type ?? 'private';
  firstName = cq.from?.first_name ?? '';
  from = cq.from ?? null;
  callbackId = cq.id;
  action = cq.data === 'retry_calc' ? 'retry' : 'unknown';
} else if (update.message) {
  const m = update.message;
  chatId = m.chat?.id ?? null;
  chatType = m.chat?.type ?? 'private';
  firstName = m.from?.first_name ?? '';
  from = m.from ?? null;
  const text = (m.text ?? '').trim();
  if (/^\/start(\s|@|$)/.test(text)) action = 'start';
  else if (text === MENU_CALC || /^\/calc(\s|@|$)/.test(text)) action = 'calculator';
  else if (text === MENU_ASK || /^\/(ask|help)(\s|@|$)/.test(text)) action = 'question';
}

if (!chatId || chatType !== 'private') return [];

return [
  {
    json: {
      chatId,
      firstName,
      callbackId,
      action,
      // Only these actions show the calculator button, so only they need the availability check.
      needsCheck: ['start', 'calculator', 'retry'].includes(action),
      // Name and username for the bot_users table (language and Premium are not kept).
      user: from
        ? {
            id: from.id,
            username: from.username ?? '',
            first_name: from.first_name ?? '',
            last_name: from.last_name ?? '',
          }
        : null,
    },
  },
];
