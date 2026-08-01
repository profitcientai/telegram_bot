const express = require("express");
const app = express();
app.use(express.json());

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const KB_ID = process.env.RETELL_KB_ID;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- Simple in-memory conversation history, per Telegram chat ---
// NOTE: this resets if the server restarts (Render free tier can spin down
// after inactivity). For permanent memory across restarts, this would need
// to move to a real database later - fine for now.
const conversationHistory = {}; // { [chatId]: [{role, content}, ...] }
const MAX_HISTORY_MESSAGES = 12; // keep the last 6 back-and-forths

function getHistory(chatId) {
  return conversationHistory[chatId] || [];
}

function appendHistory(chatId, role, content) {
  if (!conversationHistory[chatId]) conversationHistory[chatId] = [];
  conversationHistory[chatId].push({ role, content });
  if (conversationHistory[chatId].length > MAX_HISTORY_MESSAGES) {
    conversationHistory[chatId] = conversationHistory[chatId].slice(-MAX_HISTORY_MESSAGES);
  }
}

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

async function askAI(chatId, messageText, knownTopics) {
  const systemPrompt = `You are an internal staff tool called the "Instant Glow KB Assistant." You are NOT a customer-facing chatbot and you never talk to actual customers of the med spa.

Your only job is to help STAFF members (like the business owner or manager) manage the AI receptionist's knowledge base by chatting with you on Telegram. You are talking to Cameron or another staff member right now - not a lead, not a client.

Known topics currently in the knowledge base: ${knownTopics.join(", ")}

You have three possible response types:
1. "kb_update" - the staff member clearly wants to update, change, or correct a fact (price, hours, policy, service info) and it matches or clearly relates to a known topic.
2. "clarification_needed" - it sounds like an update but you're not sure which topic, or it's describing something brand new not in the list.
3. "chat" - normal conversation: greetings, thanks, small talk, or general questions directed at YOU (the assistant), not at the med spa's customers.

Always respond ONLY with a JSON object in this exact shape, no markdown:
{
  "type": "kb_update" | "clarification_needed" | "chat",
  "topic": "exact matching topic name from the list if type is kb_update, else empty string",
  "new_text": "a clean knowledge-base sentence reflecting the update if type is kb_update, else empty string",
  "reply": "a short, warm, natural reply to send back on Telegram, 1-2 sentences"
}

Remember: you are a tool for STAFF to manage their own AI's brain - speak to them like a helpful internal assistant, never like you're pitching or describing services to a customer.`;

  const history = getHistory(chatId);

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: messageText },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
    }),
  });
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Health check
app.get("/", (req, res) => {
  res.send("Instant Glow KB Bot is running.");
});

// Telegram webhook
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

    const ai = await askAI(chatId, text, knownTopics);

    // Record this exchange in memory regardless of type
    appendHistory(chatId, "user", text);
    appendHistory(chatId, "assistant", ai.reply);

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
    return res.status(200).json({ ok: true });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Instant Glow KB Bot listening on port ${PORT}`);
});
