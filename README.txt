PASS24 dashboard for Vercel

Files:
- index.html
- api/appmetrica.js
- api/banner-meta.js
- data/fallback.json
- vercel.json
- package.json

Required environment variables in Vercel:
- APPMETRICA_TOKEN
- APPMETRICA_APP_ID=4626412
- BLOB_READ_WRITE_TOKEN

How shared banner editing works:
- banner names / dates / links are stored in Vercel Blob
- if BLOB_READ_WRITE_TOKEN is missing, editor falls back to local-only mode
