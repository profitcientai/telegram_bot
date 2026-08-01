const express = require("express");
const app = express();
app.use(express.json());

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const KB_ID = process.env.RETELL_KB_ID;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function getKnowledgeBase() {
  const res = await fetch(`https://api.retellai.com/get-knowledge-base/${KB_ID}`, {
    headers: { Authorization: `Bearer ${RETELL_API_KEY}` },
  });
  return res.json();
}

async function deleteSource(sourceId) {
  const res = await fetch(
    `https://api.retellai.com/delete-knowledge-base-source/${KB_ID}/source/${sourceId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
  );
  return res.json();
}

async function addSource(title, text) {
  const form = new FormData();
  form.append("knowledge_base_texts", JSON.stringify([{ title, text }]));
  const res = await fetch(`https://api.retellai.com/add-knowledge-base-sources/${KB_ID}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RETELL_API_KEY}` },
    body: form,
  });
  return res.json();
}

async function askAI(messageText, knownTopics) {
  const prompt = `You are the assistant that manages Instant Glow Aesthetics' AI receptionist knowledge base, chatting with a staff member on Telegram.

Known topics in the knowledge base: ${knownTopics.join(", ")}

The staff member just said: "${messageText}"

Respond ONLY with a JSON object, no markdown, in this exact shape:
{
  "type": "kb_update" | "clarification_needed" | "chat",
  "topic": "exact matching topic name from the list above if type is kb_update, else empty string",
  "new_text": "a clean knowledge-base sentence reflecting the update if type is kb_update, else empty string",
  "reply": "a short, warm, natural reply to send back on Telegram"
}

Rules:
- Clear factual update (price, hours, policy) matching a known topic -> "kb_update".
- Sounds like an update but unclear which topic, or a brand new topic -> "clarification_needed", ask what's unclear in the reply.
- Small talk, greetings, thanks, unrelated chat -> "chat", reply naturally and warmly like a helpful colleague.
- Keep "reply" to 1-2 sentences.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Health check - Render pings this to confirm the service is alive
app.get("/", (req, res) => {
  res.send("Instant Glow KB Bot is running.");
});

// This is the URL Telegram will call every time someone messages the bot
app.post("/telegram", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text;

    const kb = await getKnowledgeBase();
    const knownTopics = kb.knowledge_base_sources
      .filter((s) => s.type === "text")
      .map((s) => s.title);

    const ai = await askAI(text, knownTopics);

    if (ai.type === "chat" || ai.type === "clarification_needed") {
      await sendMessage(chatId, ai.reply);
      return res.status(200).json({ ok: true });
    }

    // type === "kb_update"
    const existingSource = kb.knowledge_base_sources.find((s) => s.title === ai.topic);

    if (!existingSource) {
      await sendMessage(
        chatId,
        `I don't have "${ai.topic}" as an existing topic yet — want me to add it as brand new info instead?`
      );
      return res.status(200).json({ ok: true });
    }

    await sendMessage(chatId, `Got it — updating "${ai.topic}" now, one sec...`);
    await deleteSource(existingSource.source_id);
    await addSource(ai.topic, ai.new_text);
    await sendMessage(chatId, `Done! "${ai.topic}" is updated — the AI will use this on the next call.`);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: true }); // always 200 so Telegram doesn't retry-storm
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Instant Glow KB Bot listening on port ${PORT}`);
});
