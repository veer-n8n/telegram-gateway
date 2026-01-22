import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ==============================
// ENV
// ==============================
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const N8N_WEBHOOK = process.env.N8N_WEBHOOK;

if (!TELEGRAM_TOKEN || !N8N_WEBHOOK) {
  console.error("❌ Missing TELEGRAM_TOKEN or N8N_WEBHOOK");
  process.exit(1);
}

const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ==============================
// HEALTH CHECK
// ==============================
app.get("/", (req, res) => {
  res.send("Telegram Gateway is running ✅");
});

// ==============================
// TELEGRAM → RENDER → N8N
// Telegram webhook target
// ==============================
app.post("/telegram", async (req, res) => {
  try {
    console.log("📩 Telegram update received");

    await fetch(N8N_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Telegram forward error:", err);
    res.status(500).send("ERROR");
  }
});

// ==============================
// N8N → RENDER → TELEGRAM
// Send message
// ==============================
app.post("/send", async (req, res) => {
  try {
    const { chat_id, text } = req.body;

    if (!chat_id || !text) {
      return res.status(400).json({
        error: "chat_id and text are required",
      });
    }

    const tgResponse = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text }),
    });

    const data = await tgResponse.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Telegram send error:", err);
    res.status(500).json({ error: "Telegram send failed" });
  }
});

// ==============================
// N8N → RENDER → TELEGRAM
// FILE DOWNLOAD (BINARY STREAM)
// ==============================
app.get("/telegram-file", async (req, res) => {
  try {
    const { file_path } = req.query;

    if (!file_path) {
      return res.status(400).send("Missing file_path");
    }

    const telegramFileUrl =
      `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file_path}`;

    const tgResponse = await fetch(telegramFileUrl);

    if (!tgResponse.ok) {
      console.error("❌ Telegram file fetch failed");
      return res.status(500).send("Failed to fetch file from Telegram");
    }

    // Forward content type
    res.setHeader(
      "Content-Type",
      tgResponse.headers.get("content-type") ||
        "application/octet-stream"
    );

    // Force download
    res.setHeader("Content-Disposition", "attachment");

    // Stream binary directly to n8n
    tgResponse.body.pipe(res);
  } catch (err) {
    console.error("❌ File proxy error:", err);
    res.status(500).send("File proxy error");
  }
});

// ==============================
// START SERVER
// ==============================
app.listen(PORT, () => {
  console.log(`🚀 Telegram Gateway listening on port ${PORT}`);
});
