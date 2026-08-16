// ponytail: long-polling offset loop instead of Telegram Webhook -> works out of the box locally without public domain/tunneling

/* eslint-disable @typescript-eslint/no-require-imports */
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const { tickets, messages, insertDoc } = require("../lib/mongo");

async function notifySSE(event, data = {}) {
  try {
    await fetch("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    });
  } catch {}
}

async function telegramFetch(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function startTelegramBot() {
  if (!TELEGRAM_TOKEN) return;

  console.log("🤖 Telegram Ticket Bot ready and long-polling...");
  let offset = 0;

  while (true) {
    try {
      const data = await telegramFetch("getUpdates", { offset, timeout: 30 });
      if (data?.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.message) await handleTelegramMessage(update.message);
        }
      }
    } catch (err) {
      console.error("Telegram polling error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function handleTelegramMessage(msg) {
  const chatId = String(msg.chat.id);
  const userId = String(msg.from.id);
  const text = (msg.text || "").trim();
  const userName = msg.from.username || msg.from.first_name || "Telegram User";

  if (!text) return;

  const lowerText = text.toLowerCase();

  if (lowerText === "/start" || lowerText.startsWith("/start@")) {
    return telegramFetch("sendMessage", {
      chat_id: chatId,
      text: `👋 *Welcome to Support Helpdesk!*\n\n` +
            `To open a support ticket, please use the command:\n` +
            `👉 \`/ticket [Subject / Description]\`\n\n` +
            `*Example:*\n` +
            `\`/ticket Need help with account login\`\n\n` +
            `🔒 Type \`/close\` at any time to close an active ticket.`,
      parse_mode: "Markdown",
    });
  }

  // Active tickets are strictly OPEN or IN_PROGRESS (RESOLVED and CLOSED tickets are inactive)
  const activeTicket = await tickets.findOne({
    telegram_chat_id: chatId,
    status: { $in: ["OPEN", "IN_PROGRESS"] },
  });

  if (lowerText === "/close" || lowerText.startsWith("/close@")) {
    if (activeTicket) {
      await tickets.updateOne({ _id: activeTicket.id }, { $set: { status: "CLOSED", updated_at: new Date() } });
      notifySSE("ticket_updated", { ticketId: activeTicket.id, status: "CLOSED" });
      return telegramFetch("sendMessage", {
        chat_id: chatId,
        text: `🔒 Ticket *#${activeTicket.ticket_number}* has been closed. Thank you!`,
        parse_mode: "Markdown",
      });
    }
    return telegramFetch("sendMessage", { chat_id: chatId, text: "No active ticket to close." });
  }

  // If user ALREADY has an active ticket (OPEN or IN_PROGRESS), append message to that active ticket
  if (activeTicket) {
    await insertDoc(messages, {
      ticket_id: activeTicket.id,
      author_name: userName,
      author_role: "user",
      message: text,
      is_internal: 0,
    });
    notifySSE("message_added", { ticketId: activeTicket.id, authorName: userName, message: text });
    return;
  }

  // NO ACTIVE TICKET EXISTS:
  // Strictly enforce that a ticket MUST ONLY AND EXCLUSIVELY be created via /ticket command!
  const isTicketCmd = lowerText.startsWith("/ticket");

  if (!isTicketCmd) {
    return telegramFetch("sendMessage", {
      chat_id: chatId,
      text: `ℹ️ To open a support ticket, please use the command:\n` +
            `👉 \`/ticket [Subject / Description]\`\n\n` +
            `*Example:*\n` +
            `\`/ticket Need help with login\``,
      parse_mode: "Markdown",
    });
  }

  // Extract subject after /ticket or /ticket@bot_name
  const subject = text.replace(/^\/ticket(@\w+)?\s*/i, "").trim();

  if (!subject) {
    return telegramFetch("sendMessage", {
      chat_id: chatId,
      text: `⚠️ Please specify a subject for your ticket.\n\n` +
            `*Usage:* \`/ticket [Your issue description]\`\n` +
            `*Example:* \`/ticket Need help resetting password\``,
      parse_mode: "Markdown",
    });
  }

  // Create new ticket ONLY when /ticket [subject] command was explicitly sent
  const randomId = Math.floor(100000 + Math.random() * 900000);
  const ticketNumber = `TK-${randomId}`;
  const truncatedTitle = subject.length > 60 ? subject.slice(0, 57) + "..." : subject;

  const ticketId = await insertDoc(tickets, {
    ticket_number: ticketNumber,
    title: truncatedTitle,
    description: subject,
    status: "OPEN",
    priority: "MEDIUM",
    category: "Telegram Support",
    customer_name: userName,
    customer_email: `${userName.replace(/\s+/g, "_")}@telegram.user`,
    telegram_chat_id: chatId,
    telegram_user_id: userId,
    assigned_to: "Unassigned",
    assigned_user_id: null,
  });

  await insertDoc(messages, {
    ticket_id: ticketId,
    author_name: userName,
    author_role: "user",
    message: subject,
    is_internal: 0,
  });

  notifySSE("ticket_created", { ticketId, ticketNumber });

  await telegramFetch("sendMessage", {
    chat_id: chatId,
    text: `🎫 *Support Ticket Created!*\n\n` +
          `📋 *Ticket ID:* \`#${ticketNumber}\`\n` +
          `📌 *Subject:* ${truncatedTitle}\n\n` +
          `✍️ Our support staff has been notified. You can send further replies directly in this chat.\n\n` +
          `🔒 Type \`/close\` when finished.`,
    parse_mode: "Markdown",
  });
}

module.exports = { startTelegramBot };
