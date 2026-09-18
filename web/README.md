# NEXTGW (web)

Shareable Fantasy Premier League advisor UI. Friends enter their **entry ID** and get live “what to do next” advice.

## Local

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

## Deploy on Vercel

1. Push this repo to GitHub (or import the folder).
2. In Vercel → **Add New Project** → import the repo.
3. Set **Root Directory** to `web`.
4. Framework: Next.js (auto). Deploy.

No env vars required — uses the public FPL API from the server.

## API

`GET /api/analyze?entryId=8682977&risk=balanced&ft=1&horizon=5`

## Notes

- Entry IDs are public FPL team IDs (not passwords).
- Server-side fetch avoids browser CORS blocks on fantasy.premierleague.com.
- Unofficial; not affiliated with the Premier League / FPL.
