Vercel version with AppMetrica token sanitization.\n\nChanges:
- trims APPMETRICA_TOKEN
- removes accidental OAuth prefix, quotes, CR/LF and control characters\n- keeps the rest of the dashboard unchanged\n