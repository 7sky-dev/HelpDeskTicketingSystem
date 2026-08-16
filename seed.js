/* eslint-disable @typescript-eslint/no-require-imports */
// One-time seed: `node seed.js` (replaces the old MySQL schema.sql)
// Seed accounts (password123): admin@helpdesk.com, mod@helpdesk.com, user@helpdesk.com
const bcrypt = require("bcryptjs");
const { client, users, tickets, insertDoc } = require("./lib/mongo");

// Hash the documented seed password at the same cost as the register route.
const PASSWORD_HASH = bcrypt.hashSync("password123", 12);

async function main() {
  for (const seed of [
    { full_name: "Admin Alex", email: "admin@helpdesk.com", role: "ADMIN", tickets_accepted: 5, tickets_resolved: 4 },
    { full_name: "Piotr Moderator", email: "mod@helpdesk.com", role: "MODERATOR", tickets_accepted: 12, tickets_resolved: 10 },
    { full_name: "User Ula", email: "user@helpdesk.com", role: "USER", tickets_accepted: 0, tickets_resolved: 0 },
  ]) {
    const doc = { ...seed, password: PASSWORD_HASH };
    const existing = await users.findOne({ email: seed.email });
    if (existing) {
      // mirrors the old `ON DUPLICATE KEY UPDATE` so re-seeding restores the documented credentials
      await users.updateOne({ _id: existing._id }, { $set: doc });
      continue;
    }
    await insertDoc(users, { ...doc, discord_user_id: null });
    console.log(`✔ user ${seed.email}`);
  }

  const mod = await users.findOne({ email: "mod@helpdesk.com" });

  const sampleTickets = [
    {
      ticket_number: "TK-1001",
      title: "API Gateway Latency Issue",
      description: "Requests timing out during peak traffic hours.",
      status: "OPEN",
      priority: "URGENT",
      category: "Technical",
      customer_name: "Discord User #9021",
      customer_email: "discord9021@discord.com",
      discord_user_id: "123456789012345678",
      assigned_to: "Unassigned",
      assigned_user_id: null,
    },
    {
      ticket_number: "TK-1002",
      title: "Account Verification Help",
      description: "Need help linking Discord account to website.",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      category: "Account Access",
      customer_name: "Sarah Connor",
      customer_email: "sarah@acme.com",
      discord_user_id: "234567890123456789",
      assigned_to: "Piotr Moderator",
      assigned_user_id: mod ? mod.id : null,
    },
  ];

  for (const ticket of sampleTickets) {
    if (await tickets.findOne({ ticket_number: ticket.ticket_number })) continue;
    await insertDoc(tickets, ticket);
    console.log(`✔ ticket ${ticket.ticket_number}`);
  }

  await client.close();
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});