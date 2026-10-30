// «Разобрать апдейт»: turns a Telegram update into one action for the bot.
// Only private chats are answered; anything else produces no items and the run stops.
//
// Actions for everyone: start, calculator, question, retry, news_on, news_off, unknown.
// Extra actions for administrators (Telegram IDs in ADMIN_TELEGRAM_IDS):
//   broadcast_help   — pressed «📣 Рассылка»;
//   broadcast_draft  — sent any other message: it becomes a draft, the bot shows a preview;
//   broadcast_send   — pressed «Отправить» under the preview;
//   broadcast_cancel — pressed «Отмена» under the preview.

const MENU_CALC = '🧮 Калькулятор';
const MENU_ASK = '💬 Задать вопрос';
const MENU_BROADCAST = '📣 Рассылка';

const admins = String($env.ADMIN_TELEGRAM_IDS ?? '')
  .split(/[\s,;]+/)
  .filter(Boolean);

const update = $input.first().json;
let chatId = null;
let chatType = 'private';
let firstName = '';
let callbackId = null;
let action = 'unknown';
let from = null;
let messageId = null; // the user's message, or the message under which a button was pressed
let sourceMessageId = null; // broadcast: the administrator's original message

if (update.callback_query) {
  const cq = update.callback_query;
  chatId = cq.message?.chat?.id ?? cq.from?.id ?? null;
  chatType = cq.message?.chat?.type ?? 'private';
  firstName = cq.from?.first_name ?? '';
  from = cq.from ?? null;
  callbackId = cq.id;
  messageId = cq.message?.message_id ?? null;
  const data = String(cq.data ?? '');
  const isAdmin = admins.includes(String(from?.id));
  if (data === 'retry_calc') action = 'retry';
  else if (data === 'news_on') action = 'news_on';
  else if (data === 'news_off') action = 'news_off';
  else if (isAdmin && /^bc_send:\d+$/.test(data)) {
    action = 'broadcast_send';
    sourceMessageId = Number(data.split(':')[1]);
  } else if (isAdmin && data === 'bc_cancel') action = 'broadcast_cancel';
} else if (update.message) {
  const m = update.message;
  chatId = m.chat?.id ?? null;
  chatType = m.chat?.type ?? 'private';
  firstName = m.from?.first_name ?? '';
  from = m.from ?? null;
  messageId = m.message_id ?? null;
  const isAdmin = admins.includes(String(from?.id));
  const text = (m.text ?? '').trim();
  const cmd = (name) => new RegExp(`^/${name}(\\s|@|$)`).test(text);
  if (cmd('start')) action = 'start';
  else if (text === MENU_CALC || cmd('calc')) action = 'calculator';
  else if (text === MENU_ASK || cmd('ask') || cmd('help')) action = 'question';
  else if (cmd('news')) action = 'news_on';
  else if (cmd('stopnews')) action = 'news_off';
  else if (isAdmin && (text === MENU_BROADCAST || cmd('broadcast'))) action = 'broadcast_help';
  // Any other message from an administrator (text, photo, video, file…) is a broadcast draft.
  else if (isAdmin && !text.startsWith('/') && !m.media_group_id) action = 'broadcast_draft';
  else if (isAdmin && m.media_group_id) action = 'broadcast_album';
}

if (!chatId || chatType !== 'private') return [];

const isAdmin = admins.includes(String(from?.id));

return [
  {
    json: {
      chatId,
      firstName,
      callbackId,
      action,
      isAdmin,
      messageId,
      sourceMessageId,
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
