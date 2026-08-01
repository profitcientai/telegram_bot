# Instant Glow KB Bot v2 — with memory + fixed identity

## What changed from v1
1. The bot now clearly knows it's an INTERNAL STAFF TOOL, not a customer-facing
   chatbot. It won't respond like it's talking to a med spa customer anymore.
2. It now remembers the last several messages per person, so it understands
   follow-up context instead of treating every message as a fresh start.

## Deployment (same as before)
1. Push server.js, package.json, and this README to your GitHub repo.
2. Render -> New Web Service -> connect repo -> Node -> Build: npm install -> Start: npm start
3. Add the same 4 environment variables (TELEGRAM_TOKEN, OPENAI_API_KEY, RETELL_API_KEY, RETELL_KB_ID)
4. Deploy, then register the webhook:
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-URL.onrender.com/telegram"

## Note on memory
Memory is stored in the server's RAM, per Telegram chat ID. This resets if
the Render service restarts or spins down from inactivity (common on the
free tier). For memory that survives restarts permanently, this would need
to move to a real database (e.g. a small Postgres or Redis instance) later.
