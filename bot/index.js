// ponytail: single Node daemon handles both Discord and HTTP bridge -> split into microservices if bot scale exceeds single node process

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActivityType,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const http = require("http");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { db: mongoDb, tickets, messages, insertDoc } = require("../lib/mongo");

async function notifySSE(event, data = {}) {
  try {
    await fetch("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    });
  } catch {}
}

// ponytail: numeric auto-increment ids via the shared `counters` collection -> ObjectId if sequential ids stop mattering

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

const commands = [
  new SlashCommandBuilder()
    .setName("set")
    .setDescription("Setup ticket creation panel in channel (Moderator only)")
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Discord Bot ready as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "Support Queue | #send-ticket", type: ActivityType.Watching }],
    status: "online",
  });

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Registered /set slash command.");
  } catch (err) {
    console.error("Error registering slash commands:", err);
  }
});

function isModerator(member) {
  return (
    !!member &&
    (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.some((r) => r.name.toLowerCase() === "moderator"))
  );
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "set") {
    if (!isModerator(interaction.member)) {
      return interaction.reply({ content: "Requires **Moderator** role.", ephemeral: true });
    }

    const targetChannel = interaction.options.getChannel("channel");
    const ticketEmbed = new EmbedBuilder()
      .setTitle("Helpdesk Support")
      .setDescription("Click the button below to open a private support ticket with our moderation team.")
      .setColor(0x2b2d31);

    const createButton = new ButtonBuilder()
      .setCustomId("create_ticket_btn")
      .setLabel("Create Ticket")
      .setStyle(ButtonStyle.Secondary);

    try {
      await targetChannel.send({
        embeds: [ticketEmbed],
        components: [new ActionRowBuilder().addComponents(createButton)],
      });
      await interaction.reply({ content: `Support panel deployed to <#${targetChannel.id}>.`, ephemeral: true });
    } catch (err) {
      console.error("Panel deploy error:", err);
      await interaction.reply({ content: "Failed to deploy support panel.", ephemeral: true });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "create_ticket_btn") {
    const modal = new ModalBuilder()
      .setCustomId("create_ticket_modal")
      .setTitle("Open Support Ticket");

    const titleInput = new TextInputBuilder()
      .setCustomId("ticket_title_input")
      .setLabel("Ticket Subject / Title")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. Need help with login / account issue")
      .setRequired(true)
      .setMaxLength(100);

    const descInput = new TextInputBuilder()
      .setCustomId("ticket_desc_input")
      .setLabel("Detailed Description")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Please describe your issue or question in detail...")
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput)
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "create_ticket_modal") {
    await interaction.deferReply({ ephemeral: true });

    const ticketTitle = interaction.fields.getTextInputValue("ticket_title_input");
    const ticketDesc = interaction.fields.getTextInputValue("ticket_desc_input");

    try {
      await mongoDb.command({ ping: 1 });
    } catch (dbErr) {
      return interaction.editReply({ content: "❌ Database unreachable. Ticket creation aborted." });
    }

    const { guild, user } = interaction;
    const randomId = Math.floor(100000 + Math.random() * 900000);
    const channelName = `ticket-${randomId}`;
    const ticketNumber = `TK-${randomId}`;
    const modRole = guild.roles.cache.find((r) => r.name.toLowerCase() === "moderator");

    let ticketChannel = null;
    try {
      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ];

      if (modRole) {
        permissionOverwrites.push({
          id: modRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
      }

      ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites,
        reason: `Support ticket ${ticketNumber} opened by ${user.tag}`,
      });

      const ticketId = await insertDoc(tickets, {
        ticket_number: ticketNumber,
        title: ticketTitle,
        description: ticketDesc,
        status: "OPEN",
        priority: "MEDIUM",
        category: "Discord Support",
        customer_name: user.tag || user.username,
        customer_email: `${user.username}@discord.user`,
        discord_user_id: user.id,
        discord_channel_id: ticketChannel.id,
        assigned_to: "Unassigned",
        assigned_user_id: null,
      });

      await insertDoc(messages, {
        ticket_id: ticketId,
        author_name: user.username,
        author_role: "user",
        message: ticketDesc,
        is_internal: 0,
      });

      notifySSE("ticket_created", { ticketId, ticketNumber });

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`🎫 Ticket #${ticketNumber} — ${ticketTitle}`)
        .setDescription(`Welcome <@${user.id}>!\n\n**Issue Description:**\n${ticketDesc}\n\nA support moderator will assist you shortly.`)
        .addFields(
          { name: "Priority", value: "MEDIUM", inline: true },
          { name: "Category", value: "Discord Support", inline: true }
        )
        .setColor(0x2b2d31)
        .setFooter({ text: "Helpdesk Ticket System" })
        .setTimestamp();

      await ticketChannel.send({
        content: `<@${user.id}> ${modRole ? `<@&${modRole.id}>` : ""}`,
        embeds: [welcomeEmbed],
      });

      await interaction.editReply({ content: `Ticket created: <#${ticketChannel.id}>` });
    } catch (err) {
      console.error("Ticket creation error:", err);
      if (ticketChannel) await ticketChannel.delete("Rollback on DB failure").catch(() => null);
      await interaction.editReply({ content: "❌ Failed to create ticket due to a system error." });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "hide_channel_btn") {
    try {
      await interaction.deferUpdate().catch(() => null);
      if (interaction.channel?.permissionOverwrites) {
        await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: false });
      }
    } catch (err) {
      console.error("Error hiding channel:", err);
    }
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    if (reaction.emoji.name === "🙈" && reaction.message.channel?.permissionOverwrites) {
      await reaction.message.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
    }
  } catch (err) {
    console.error("Emoji reaction error:", err);
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    const ticket = await tickets.findOne(
      { discord_channel_id: message.channel.id, status: { $ne: "CLOSED" } },
      { projection: { id: 1, customer_name: 1, discord_user_id: 1, assigned_to: 1, assigned_user_id: 1 } }
    );

    if (!ticket) return;

    const isClaimed = Boolean(ticket.assigned_user_id && ticket.assigned_to && ticket.assigned_to !== "Unassigned");

    let member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
    const isAdmin = member ? member.permissions.has(PermissionFlagsBits.Administrator) : false;
    const isStaff = (isAdmin || isModerator(member)) && message.author.id !== ticket.discord_user_id;

    if (!isClaimed && isStaff) {
      await message.delete().catch(() => null);
      const warning = await message.channel
        .send({
          content: `⚠️ <@${message.author.id}>, claim this ticket before sending messages.`,
        })
        .catch(() => null);

      if (warning) setTimeout(() => warning.delete().catch(() => null), 6000);
      return;
    }

    const authorRole = isStaff ? (isAdmin ? "admin" : "moderator") : "user";
    await insertDoc(messages, {
      ticket_id: ticket.id,
      author_name: message.author.username,
      author_role: authorRole,
      message: message.content,
      is_internal: 0,
      discord_message_id: message.id,
    });

    notifySSE("message_added", { ticketId: ticket.id, authorName: message.author.username, message: message.content });
  } catch (err) {
    console.error("Discord sync error:", err);
  }
});

function readJson(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); }
    });
  });
}

const BOT_PORT = Number(process.env.BOT_PORT) || 3001;

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== "POST") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Not found" }));
  }

  const payload = await readJson(req);

  try {
    if (req.url === "/bot/send-message") {
      const { channelId, chatId, message, authorName } = payload;
      if ((!channelId && !chatId) || !message) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Missing parameters" }));
      }

      if (channelId) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) await channel.send(`**${authorName || "Staff"}**: ${message}`);
      }

      if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `💬 ${authorName || "Staff"}: ${message}` }),
        }).catch((err) => console.error("Telegram send error:", err.message));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true }));
    }

    if (req.url === "/bot/claim-ticket") {
      const { channelId, chatId, userName } = payload;
      if (channelId) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) await channel.send(`Ticket has been claimed by **${userName || "a Moderator"}**.`);
      }
      if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `👤 Ticket claimed by ${userName || "a Moderator"}.` }),
        }).catch(() => null);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true }));
    }

    if (req.url === "/bot/resolve-ticket") {
      const { channelId, chatId, ticketNumber, resolvedBy } = payload;
      if (channelId) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          await channel.send(`Ticket **${ticketNumber || ""}** resolved by **${resolvedBy || "Moderator"}**.`);
          await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, { SendMessages: false });
          const hideBtn = new ButtonBuilder().setCustomId("hide_channel_btn").setLabel("Hide Channel").setEmoji("🙈").setStyle(ButtonStyle.Secondary);
          await channel.send({ content: "React with 🙈 or click below to hide this channel.", components: [new ActionRowBuilder().addComponents(hideBtn)] });
        }
      }
      if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Twój ticket ${ticketNumber || ""} został pomyślnie rozwiązany przez ${resolvedBy || "Administratora"}.\nNapisz /close aby zamknąć ten ticket.` }),
        }).catch((err) => console.error("Telegram resolve message error:", err.message));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true }));
    }

    if (req.url === "/bot/delete-ticket-channel") {
      const { channelId, chatId, ticketNumber, deletedBy } = payload;
      if (channelId) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) await channel.delete("Ticket deleted by Admin").catch((err) => console.error("Discord channel delete error:", err));
      }
      if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `🗑️ Twój ticket ${ticketNumber || ""} został usunięty przez administratora ${deletedBy || "Administrator"}.` }),
        }).catch((err) => console.error("Failed to send Telegram deletion message:", err.message));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true }));
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Endpoint not found" }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(BOT_PORT, () => console.log(`🌐 Bot HTTP Bridge active at http://localhost:${BOT_PORT}`));

if (process.env.DISCORD_BOT_TOKEN) {
  client.login(process.env.DISCORD_BOT_TOKEN);
} else {
  console.log("⚠️ DISCORD_BOT_TOKEN missing in env.");
}

const { startTelegramBot } = require("./telegram");
startTelegramBot();
