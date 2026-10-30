// «Собрать ответ»: decides what the bot sends. Each output item is one Bot API call
// ({ method, payload }); the next node sends them in order.
// Links and texts come from environment variables set in docker-compose (.env).

const MENU_CALC = '🧮 Калькулятор';
const MENU_ASK = '💬 Задать вопрос';
const MENU_BROADCAST = '📣 Рассылка';

const p = $('Разобрать апдейт').first().json;
const calcUrl = $env.CALCULATOR_URL;
const policyUrl = $env.PD_POLICY_URL;
const consentUrl = $env.PD_CONSENT_URL;
const specialistUrl = $env.SPECIALIST_URL;
const mailingConsentUrl = $env.PD_MAILING_CONSENT_URL;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The calculator counts as available only if its page answered 2xx and is really our app.
let available = false;
if (p.needsCheck) {
  const r = $input.first().json;
  const body = typeof r.body === 'string' ? r.body : typeof r.data === 'string' ? r.data : '';
  available = !r.error && r.statusCode >= 200 && r.statusCode < 300 && body.includes('sovest-mortgage-calculator');
}

// Administrators get one more menu button for broadcasts.
const menuKeyboard = {
  keyboard: [[{ text: MENU_CALC }, { text: MENU_ASK }], ...(p.isAdmin ? [[{ text: MENU_BROADCAST }]] : [])],
  resize_keyboard: true,
  is_persistent: true,
};
const calcButton = { inline_keyboard: [[{ text: '🧮 Открыть калькулятор', web_app: { url: calcUrl } }]] };
const retryButton = { inline_keyboard: [[{ text: '🔄 Повторить', callback_data: 'retry_calc' }]] };

const send = (text, reply_markup) => ({
  json: {
    method: 'sendMessage',
    payload: { chat_id: p.chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup },
  },
});

// Same buttons are used by «Подписка на новости» and «Рассылка» branches of the workflow.
const newsButton = { inline_keyboard: [[{ text: '🔔 Получать новости', callback_data: 'news_on' }]] };
const removeButtons = () => ({
  json: {
    method: 'editMessageReplyMarkup',
    payload: { chat_id: p.chatId, message_id: p.messageId, reply_markup: { inline_keyboard: [] } },
  },
});

const newsPrompt =
  'Прежде чем продолжим, один важный момент\n\n' +
  'Я буду присылать в этот бот полезные материалы, если хотите получать – нажмите кнопку под этим сообщением👇 ' +
  'Никакого спама, согласие нужно по требованиям законодательства РФ.\n\n' +
  'Нажимая на кнопку, вы подтверждаете, что ' +
  `<a href="${esc(mailingConsentUrl)}">согласны получать информационные и рекламные рассылки</a>`;

// Some phones can't open the Mini App inside Telegram (stuck in-app browser, VPN): offer the same page in a browser.
const browserHint = `\n\nЕсли калькулятор не открылся в Telegram, откройте его в браузере по <a href="${esc(calcUrl)}">ссылке</a>.`;

const unavailable = () =>
  send(
    'Калькулятор сейчас не открывается — похоже, на сервере неполадки.\n\n' +
      'Попробуйте ещё раз через пару минут: нажмите «Повторить».',
    retryButton,
  );

const welcomeText =
  `Здравствуйте${p.firstName ? `, ${esc(p.firstName)}` : ''}! 👋\n\n` +
  'Это ипотечный калькулятор центра недвижимости «Совесть». ' +
  'Он покажет ежемесячный платёж, переплату и то, как досрочные погашения сокращают срок и проценты.\n\n' +
  '⚠️ <b>Калькулятор носит ознакомительный характер.</b> Расчёт не является публичной офертой; ' +
  'точные условия кредита определяет банк.\n\n' +
  'Пользуясь ботом, вы соглашаетесь с ' +
  `<a href="${esc(policyUrl)}">политикой обработки персональных данных</a> и даёте ` +
  `<a href="${esc(consentUrl)}">согласие на обработку персональных данных</a>.`;

const out = [];

if (p.callbackId) {
  // Stops the loading spinner on the pressed inline button.
  out.push({ json: { method: 'answerCallbackQuery', payload: { callback_query_id: p.callbackId } } });
}

switch (p.action) {
  case 'start':
    if (available) {
      // A message carries either buttons under it or the bottom menu. The welcome has the calculator button,
      // the bottom menu comes with the next reply (e.g. «Готово, вы подписаны»); commands are in the «Меню» button.
      out.push(send(welcomeText + browserHint, calcButton));
    } else {
      out.push(send(welcomeText, menuKeyboard));
      out.push(unavailable());
    }
    out.push(send(newsPrompt, newsButton));
    break;
  case 'news_on':
    if (p.callbackId) out.push(removeButtons());
    out.push(
      send(
        'Готово, вы подписаны на новости 🔔\n\n' +
          'Отписаться можно в любой момент: кнопкой под любой рассылкой или командой /stopnews.',
        menuKeyboard,
      ),
    );
    break;
  case 'news_off':
    if (p.callbackId) out.push(removeButtons());
    out.push(
      send(
        'Вы отписались от новостей — больше присылать их не будем.\n\nПодписаться снова: команда /news.',
        menuKeyboard,
      ),
    );
    break;
  case 'broadcast_help':
    out.push(
      send(
        '📣 <b>Рассылка подписчикам</b>\n\n' +
          'Пришлите сюда сообщение так, как его должны увидеть подписчики: текст, фото или видео с подписью, файл. ' +
          'Форматирование и ссылки сохранятся.\n\n' +
          'Бот покажет предпросмотр с кнопками «Отправить» и «Отмена». До нажатия «Отправить» никто ничего не получит.',
        menuKeyboard,
      ),
    );
    break;
  case 'broadcast_album':
    out.push(send('Альбом из нескольких фото разослать не получится. Пришлите одно фото или видео с подписью.'));
    break;
  case 'broadcast_draft':
    out.push(send('Предпросмотр 👇 Так рассылку увидят подписчики. Проверьте и нажмите «Отправить».'));
    out.push({
      json: {
        method: 'copyMessage',
        payload: {
          chat_id: p.chatId,
          from_chat_id: p.chatId,
          message_id: p.messageId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Отправить подписчикам', callback_data: `bc_send:${p.messageId}` },
                { text: 'Отмена', callback_data: 'bc_cancel' },
              ],
            ],
          },
        },
      },
    });
    break;
  case 'broadcast_cancel':
    out.push(removeButtons());
    out.push(send('Рассылка отменена.'));
    break;
  case 'broadcast_send':
    // The sending itself runs in the «Рассылка» branch; here only the buttons go away.
    out.push(removeButtons());
    out.push(send('Отправляю рассылку… Когда закончу, пришлю отчёт.'));
    break;
  case 'calculator':
  case 'retry':
    out.push(available ? send('Откройте калькулятор по кнопке ниже.' + browserHint, calcButton) : unavailable());
    break;
  case 'question':
    out.push(
      send(
        'Ответим на вопросы об ипотеке, объектах и сделке. Напишите нашему специалисту — он ответит в личных сообщениях.',
        { inline_keyboard: [[{ text: '✉️ Написать специалисту', url: specialistUrl }]] },
      ),
    );
    break;
  default:
    out.push(send('Выберите действие в меню ниже 👇', menuKeyboard));
}

return out;
