# Documents on personal data

`public/privacy.html` and `public/consent.html` are the operator's policy and consent,
converted from the client's .docx files with the text unchanged. Published at
`<calculator address>/privacy.html` and `/consent.html`; the bot links to them through
PD_POLICY_URL and PD_CONSENT_URL in /opt/beget/n8n/.env.

To update from a new .docx:

    pandoc new.docx -t html5 --wrap=none -o new.frag.html
    python3 docs/legal/make_pages.py new.frag.html public/privacy.html

The script refuses to write if any word of the source text is lost or reordered.
