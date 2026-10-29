# Documents on personal data

`public/privacy.html` (политика) and `public/consent.html` (согласие) for the operator
ИП Ульянова П. А.. Published at `<calculator address>/privacy.html` and
`/consent.html`; the bot links to them through PD_POLICY_URL and PD_CONSENT_URL in
/opt/beget/n8n/.env.

The texts live in `docs/legal/privacy.src.html` and `docs/legal/consent.src.html`.
After editing them run:

    python3 docs/legal/build_documents.py

When the bot or calculator starts collecting new data or sending it somewhere new, update
sections 2 and 6 of the policy and sections 1 and 4 of the consent, and the date.

`make_pages.py` is the older converter for documents supplied as .docx.
