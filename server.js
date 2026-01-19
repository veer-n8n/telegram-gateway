import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const N8N_WEBHOOK = process.env.N8N_WEBHOOK;

if (!TELEGRAM_TOKEN || !N8N_WEBHOOK) {
  console.error("Missing TELEGRAM_TOKEN or N8N_WEBHOOK env variables");
  process.exit(1);
}

const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/**
 * Telegram → Render → n8n
 * Telegram webhook endpoint
 */
app.post("/telegram", async (req, res) => {
  try {
    await fetch(N8N_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    // Telegram only needs 200 OK
    res.status(200).send("OK");
  } catch (err) {
    console.error("Error forwarding to n8n:", err);
    res.status(500).send("ERROR");
  }
});

/**
 * n8n → Render → Telegram
 * Send message endpoint
 */
app.post("/send", async (req, res) => {
  try {
    const { chat_id, text } = req.body;

    if (!chat_id || !text) {
      return res.status(400).json({
        error: "chat_id and text are required"
      });
    }

    const response = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id,
        text
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error sending Telegram message:", err);
    res.status(500).json({ error: "Telegram send failed" });
  }
});

/**
 * Health check (optional but useful)
 */
app.get("/", (req, res) => {
  res.send("Telegram Gateway is running ✅");
});

app.listen(PORT, () => {
  console.log(`Telegram Gateway listening on port ${PORT}`);
});
