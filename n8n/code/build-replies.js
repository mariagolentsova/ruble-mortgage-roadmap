// «Собрать ответ»: decides what the bot sends. Each output item is one Bot API call
// ({ method, payload }); the next node sends them in order.
// Links and texts come from environment variables set in docker-compose (.env).

const MENU_CALC = '🧮 Калькулятор';
const MENU_ASK = '💬 Задать вопрос';

const p = $('Разобрать апдейт').first().json;
const calcUrl = $env.CALCULATOR_URL;
const policyUrl = $env.PD_POLICY_URL;
const consentUrl = $env.PD_CONSENT_URL;
const specialistUrl = $env.SPECIALIST_URL;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The calculator counts as available only if its page answered 2xx and is really our app.
let available = false;
if (p.needsCheck) {
  const r = $input.first().json;
  const body = typeof r.body === 'string' ? r.body : typeof r.data === 'string' ? r.data : '';
  available = !r.error && r.statusCode >= 200 && r.statusCode < 300 && body.includes('sovest-mortgage-calculator');
}

const menuKeyboard = {
  keyboard: [[{ text: MENU_CALC }, { text: MENU_ASK }]],
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
      out.push(send(welcomeText, calcButton));
      // A message carries either buttons under it or the bottom menu, so the menu comes in a short second message.
      out.push(send('Меню 👇', menuKeyboard));
    } else {
      out.push(send(welcomeText, menuKeyboard));
      out.push(unavailable());
    }
    break;
  case 'calculator':
  case 'retry':
    out.push(available ? send('Откройте калькулятор по кнопке ниже:', calcButton) : unavailable());
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
