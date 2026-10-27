// «Собрать строки для таблицы»: one row per bot user for the Google Sheet.
// Keys are the sheet's column headers; the sheet node matches rows by «Telegram ID».
// The user's last saved calculation (if any) is added from mortgage_calculations.

const users = $('Пользователи бота').all().map((i) => i.json).filter((u) => u.telegram_id);
let calcs = [];
try {
  calcs = $('Сохранённые расчёты').all().map((i) => i.json).filter((c) => c.telegram_id);
} catch {
  calcs = []; // nobody has saved a calculation yet: the table may not exist
}
const calcById = new Map(calcs.map((c) => [String(c.telegram_id), c]));

// Moscow has been UTC+3 all year since 2014. "2026-10-27 07:00" is read as a date by Google Sheets.
const msk = (v) => {
  if (!v) return '';
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return '';
  return new Date(t.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
};

const ACTIONS = {
  start: 'Нажал «Старт»',
  calculator: 'Открыл калькулятор',
  question: 'Задать вопрос',
  retry: 'Повтор (калькулятор был недоступен)',
  unknown: 'Другое сообщение',
};

const now = msk(new Date());
const rows = users
  .slice()
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  .map((u) => {
    const c = calcById.get(String(u.telegram_id));
    return {
      json: {
        'Telegram ID': String(u.telegram_id),
        'Ник': u.username ? '@' + u.username : '',
        'Ссылка на профиль': u.profile_link || '',
        'Имя': u.first_name || '',
        'Фамилия': u.last_name || '',
        'Язык': u.language_code || '',
        'Premium': u.is_premium ? 'да' : 'нет',
        'Первое обращение': msk(u.createdAt),
        'Последняя активность': msk(u.last_seen_at || u.updatedAt),
        'Последнее действие': ACTIONS[u.last_action] || u.last_action || '',
        'Сохранил расчёт': c ? 'да' : 'нет',
        'Дата расчёта': c ? msk(c.saved_at || c.updatedAt) : '',
        'Сумма кредита, ₽': c ? Number(c.loan_amount) : '',
        'Ставка, %': c ? Number(c.rate) : '',
        'Срок, мес.': c ? Number(c.term_months) : '',
        'Ежемесячный платёж, ₽': c ? Number(c.monthly_payment) : '',
        'Досрочные погашения': c ? c.prepayments || '' : '',
        'Обновлено': now,
      },
    };
  });

return rows;
