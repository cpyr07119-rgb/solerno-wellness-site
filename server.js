require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, "[]", "utf8");

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: "Слишком много попыток. Попробуйте позже." }
});

function readBookings() {
  try { return JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf8")); }
  catch { return []; }
}
function writeBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf8");
}
function clean(value, max = 300) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, max);
}
function authorized(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const supplied = req.get("x-admin-password") || "";
  return expected.length >= 12 && supplied.length > 0 && supplied === expected;
}

async function notifyTelegram(booking) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: "Telegram is not configured" };

  const text =
    "🔔 Новая заявка — SOLERNO\n\n" +
    "👤 Имя: " + booking.name + "\n" +
    "📞 Телефон: " + booking.phone + "\n" +
    "✨ Услуга: " + booking.service + "\n" +
    "📅 Желаемая дата: " + (booking.date || "не указана") + "\n" +
    "🕒 Желаемое время: " + (booking.time || "не указано") + "\n" +
    "💬 Комментарий: " + (booking.comment || "нет") + "\n\n" +
    "Статус: новая заявка, время ещё не подтверждено.";

  try {
    const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      console.error("Telegram notification failed:", data.description || response.status);
      return { sent: false, reason: "Telegram API returned an error" };
    }
    return { sent: true };
  } catch (err) {
    console.error("Telegram notification error:", err.message);
    return { sent: false, reason: "Telegram network error" };
  }
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "solerno-bookings" }));

app.post("/api/bookings", bookingLimiter, async (req, res) => {
  const body = req.body || {};
  // Honeypot field: ordinary visitors never see or fill it.
  if (body.website) return res.status(200).json({ ok: true, message: "Заявка отправлена." });

  const name = clean(body.name, 100);
  const phone = clean(body.phone, 40);
  const service = clean(body.service, 120);
  const date = clean(body.date, 20);
  const time = clean(body.time, 20);
  const comment = clean(body.comment, 500);
  const consent = body.consent === true;

  if (!name || !phone || !service || !consent) {
    return res.status(400).json({ ok: false, message: "Заполните имя, телефон, услугу и подтвердите согласие." });
  }
  if (!/[0-9+()\- ]{7,}/.test(phone)) {
    return res.status(400).json({ ok: false, message: "Проверьте номер телефона." });
  }

  const booking = {
    id: "SL-" + Date.now().toString(36).toUpperCase(),
    createdAt: new Date().toISOString(),
    name, phone, service, date, time, comment,
    status: "Новая"
  };

  const bookings = readBookings();
  bookings.unshift(booking);
  writeBookings(bookings);

  const telegram = await notifyTelegram(booking);
  return res.status(201).json({
    ok: true,
    id: booking.id,
    message: telegram.sent
      ? "Заявка отправлена! Администратор свяжется с вами для подтверждения времени."
      : "Заявка сохранена. Уведомление администратору пока не настроено; свяжитесь с клубом по телефону 8 (3822) 51-70-01.",
    notificationSent: telegram.sent
  });
});

app.get("/api/admin/bookings", (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, message: "Неверный пароль администратора." });
  const bookings = readBookings().map(b => ({
    id: b.id, createdAt: b.createdAt, name: b.name, phone: b.phone,
    service: b.service, date: b.date, time: b.time, comment: b.comment, status: b.status
  }));
  res.json({ ok: true, bookings });
});

app.patch("/api/admin/bookings/:id", (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, message: "Неверный пароль администратора." });
  const allowed = ["Новая", "Подтверждена", "Связаться", "Отменена", "Состоялась"];
  const status = clean(req.body && req.body.status, 40);
  if (!allowed.includes(status)) return res.status(400).json({ ok: false, message: "Недопустимый статус." });
  const bookings = readBookings();
  const booking = bookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ ok: false, message: "Заявка не найдена." });
  booking.status = status;
  writeBookings(bookings);
  res.json({ ok: true, booking });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Solerno website running on http://localhost:${PORT}`);
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log("Telegram is not configured yet. Copy .env.example to .env and add bot token/chat ID.");
  }
});
