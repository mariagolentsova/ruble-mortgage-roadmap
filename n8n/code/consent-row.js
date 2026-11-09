// «Согласие: строка»: one consents row per Telegram user — proof of the consent given with the button
// «СОГЛАСЕН / СОГЛАСНА»: when, which button, and which documents the message linked to.

const p = $('Разобрать апдейт').first().json;
const u = p.user;
if (!u || !u.id) return [];

const clip = (s, n) => String(s ?? '').slice(0, n);

return [
  {
    json: {
      telegram_id: String(u.id),
      username: clip(u.username, 64),
      first_name: clip(u.first_name, 128),
      consent_at: new Date().toISOString(),
      button_text: 'СОГЛАСЕН / СОГЛАСНА',
      pd_policy_url: clip($env.PD_POLICY_URL, 300),
      pd_consent_url: clip($env.PD_CONSENT_URL, 300),
      mailing_consent_url: clip($env.PD_MAILING_CONSENT_URL, 300),
    },
  },
];
