// «Проверить подпись Telegram»: validates Mini App initData (HMAC-SHA256 with the bot token,
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
// and turns the calculation into one Data Table row keyed by the Telegram user ID.
// The user ID is taken only from the signed initData, never from the request body.

const crypto = require('crypto');

const MAX_AGE_SECONDS = 24 * 60 * 60;
const NUMBER_FIELDS = [
  'price',
  'down_payment',
  'loan_amount',
  'term_months',
  'rate',
  'monthly_payment',
  'total_interest',
  'overpayment_pct',
  'total_paid',
  'actual_term_months',
  'prepaid_total',
  'saved_interest',
];
const STRING_FIELDS = ['start_month', 'prepayments', 'last_payment_month'];

const fail = (status, error) => [{ json: { valid: false, status, error } }];

const body = $input.first().json.body ?? {};
const token = $env.TELEGRAM_BOT_TOKEN;
if (!token) return fail(500, 'bot_token_not_configured');
if (typeof body.initData !== 'string' || !body.calculation || typeof body.calculation !== 'object') {
  return fail(400, 'bad_request');
}

// 1. Signature. (URLSearchParams is not available in the Code-node sandbox, so parse by hand.)
const decode = (s) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return null;
  }
};
const params = new Map();
for (const part of body.initData.split('&')) {
  if (!part) continue;
  const eq = part.indexOf('=');
  const key = decode(eq < 0 ? part : part.slice(0, eq));
  const value = decode(eq < 0 ? '' : part.slice(eq + 1));
  if (key === null || value === null) return fail(401, 'bad_init_data');
  params.set(key, value);
}
const hash = params.get('hash');
if (!hash) return fail(401, 'no_signature');
params.delete('hash');
const dataCheckString = [...params.entries()]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');
const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) {
  return fail(401, 'bad_signature');
}

// 2. Freshness: initData older than a day is refused.
const authDate = Number(params.get('auth_date'));
if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return fail(401, 'expired');

// 3. User.
let user;
try {
  user = JSON.parse(params.get('user') ?? '');
} catch {
  return fail(401, 'no_user');
}
if (!user || !user.id) return fail(401, 'no_user');

// 4. Calculation.
const c = body.calculation;
const row = {
  telegram_id: String(user.id),
  username: String(user.username ?? '').slice(0, 64),
  first_name: String(user.first_name ?? '').slice(0, 128),
  last_name: String(user.last_name ?? '').slice(0, 128),
};
for (const k of NUMBER_FIELDS) {
  const v = Number(c[k]);
  if (!Number.isFinite(v) || v < 0 || v > 1e12) return fail(400, `bad_field_${k}`);
  row[k] = v;
}
for (const k of STRING_FIELDS) {
  if (typeof c[k] !== 'string') return fail(400, `bad_field_${k}`);
  row[k] = c[k].slice(0, 2000);
}
row.saved_at = new Date().toISOString();

return [{ json: { valid: true, row } }];
