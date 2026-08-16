/* eslint-disable @typescript-eslint/no-require-imports */
const { MongoClient } = require("mongodb");

// Shared by the Next.js server and the bot daemon.
// ponytail: numeric auto-increment ids via a `counters` collection so every existing
// `id`/`assigned_user_id` consumer keeps working -> switch to ObjectId if sequential ids stop mattering.

const uri =
  process.env.MONGODB_URI ||
  `mongodb://${process.env.DB_HOST || "localhost"}/${process.env.DB_NAME || "helpdesk_db"}`;

const client = new MongoClient(uri);
const db = client.db();
const counters = db.collection("counters");

// ponytail: collections typed `any` because `_id` holds the numeric MySQL-style id, not an ObjectId
const users = /** @type {any} */ (db.collection("users"));
const tickets = /** @type {any} */ (db.collection("tickets"));
const messages = /** @type {any} */ (db.collection("messages"));
const auditLogs = /** @type {any} */ (db.collection("audit_logs"));

// unique indexes replace the MySQL UNIQUE constraints (idempotent, best-effort on boot)
users.createIndex({ email: 1 }, { unique: true }).catch(() => {});
tickets.createIndex({ ticket_number: 1 }, { unique: true }).catch(() => {});
tickets.createIndex({ discord_channel_id: 1 }).catch(() => {});
tickets.createIndex({ telegram_chat_id: 1 }).catch(() => {});

async function nextId(name) {
  const doc = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return doc.seq;
}

/** Insert a doc with `_id`/`id` = sequence number plus the old MySQL timestamp defaults. */
async function insertDoc(coll, doc) {
  const id = await nextId(coll.collectionName);
  await coll.insertOne({ _id: id, id, created_at: new Date(), updated_at: new Date(), ...doc });
  return id;
}

module.exports = { client, db, users, tickets, messages, auditLogs, insertDoc };