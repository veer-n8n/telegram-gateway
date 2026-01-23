import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();

/* ==============================
   ENV
============================== */
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const N8N_WEBHOOK = process.env.N8N_WEBHOOK;

if (!TELEGRAM_TOKEN || !N8N_WEBHOOK) {
  console.error("❌ Missing TELEGRAM_TOKEN or N8N_WEBHOOK");
  process.exit(1);
}

const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/* ==============================
   BODY PARSERS
============================== */
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

/* ==============================
   HEALTH CHECK
============================== */
app.get("/", (_, res) => {
  res.send("Telegram Gateway is running ✅");
});

/* ==============================
   UNIVERSAL STREAMING PROXY
   (Telegram ↔ n8n safe)
============================== */
app.all("/proxy", async (req, res) => {
  try {
    const { url, method = "GET", headers = {}, body } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing url" });

    const tgRes = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // 🔥 Forward ALL important headers
    const contentType = tgRes.headers.get("content-type");
    const contentDisposition = tgRes.headers.get("content-disposition");
    const contentLength = tgRes.headers.get("content-length");

    if (contentType) res.setHeader("Content-Type", contentType);
    if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);
    if (contentLength) res.setHeader("Content-Length", contentLength);

    // 🚀 Stream raw response (NO buffering, NO conversion)
    tgRes.body.pipe(res);
  } catch (err) {
    console.error("❌ Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ==============================
   TELEGRAM → N8N
============================== */
app.post("/telegram", async (req, res) => {
  try {
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

/* ==============================
   N8N → TELEGRAM (TEXT)
============================== */
app.post("/send", async (req, res) => {
  try {
    const { chat_id, text } = req.body;
    if (!chat_id || !text) {
      return res.status(400).json({ error: "chat_id and text required" });
    }

    const r = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text }),
    });

    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: "Telegram send failed" });
  }
});

/* ==============================
   N8N → TELEGRAM (ANY FILE)
============================== */
app.post("/send-file", async (req, res) => {
  try {
    const { chat_id, type, file_url, caption } = req.body;
    if (!chat_id || !type || !file_url) {
      return res.status(400).json({ error: "chat_id, type, file_url required" });
    }

    const methods = {
      photo: "sendPhoto",
      document: "sendDocument",
      audio: "sendAudio",
      voice: "sendVoice",
      video: "sendVideo",
    };

    if (!methods[type]) {
      return res.status(400).json({ error: `Unsupported type ${type}` });
    }

    const payload = { chat_id, [type]: file_url };
    if (caption) payload.caption = caption;

    const r = await fetch(`${TG_API}/${methods[type]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: "Telegram send-file failed" });
  }
});

/* ==============================
   START
============================== */
app.listen(PORT, () => {
  console.log(`🚀 Telegram Gateway listening on ${PORT}`);
});
