# Instant Glow KB Bot — Render Deployment

## What this is
A Telegram bot that lets staff update the Instant Glow AI receptionist's
knowledge base just by chatting naturally — e.g. "update Botox price to $18 per unit".

## Deployment steps (Render)

### 1. Push this folder to GitHub
Upload server.js, package.json, and this README to your repo.

### 2. Create a new Web Service on Render
- Go to render.com -> New -> Web Service
- Connect your GitHub repo
- Environment: Node
- Build Command: npm install
- Start Command: npm start
- Instance Type: Free is fine for this workload

### 3. Add Environment Variables in Render
Under the service's "Environment" tab, add:

| Key | Value |
|---|---|
| TELEGRAM_TOKEN | your bot token from BotFather |
| OPENAI_API_KEY | your OpenAI API key |
| RETELL_API_KEY | your Retell API key |
| RETELL_KB_ID | knowledge_base_f4f624c233fc757b |

### 4. Deploy
Render will build and deploy automatically. You'll get a URL like:
https://instant-glow-kb-bot.onrender.com

### 5. Register the webhook with Telegram
Once deployed and the health check at the root URL responds, run this ONE time
(replace with your real values):

curl "https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=https://instant-glow-kb-bot.onrender.com/telegram"

You should see: {"ok":true,"result":true,"description":"Webhook was set"}

### 6. Test it
Message the bot on Telegram. It should reply instantly, 24/7.

## Note on Render's free tier
Free Web Services on Render "spin down" after periods of inactivity and take
a few seconds to wake back up on the next request. The first message after
a quiet period may feel slightly delayed (a few seconds) while it wakes up -
after that it responds normally. If this matters for a production/client-facing
bot, Render's cheapest paid tier keeps it always-on with no wake-up delay.
