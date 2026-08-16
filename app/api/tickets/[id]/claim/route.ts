import { NextResponse } from "next/server";
import { tickets, users, messages, insertDoc } from "@/lib/db";
import { getUserWithFreshRole } from "@/lib/auth-server";
import { recordAuditEvent } from "@/lib/audit-log";
import { broadcastEvent } from "@/app/api/events/route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getUserWithFreshRole(request);

    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

    // Any authenticated user / moderator / administrator may claim, but ONLY tickets
    // that are currently unclaimed. The filter makes claiming atomic, so a ticket can
    // never be claimed twice underneath two simultaneous agents.
    const result = await tickets.updateOne(
      {
        _id: Number(id),
        $or: [{ assigned_to: "Unassigned" }, { assigned_to: null }, { assigned_user_id: null }],
      },
      { $set: { assigned_to: user.fullName, assigned_user_id: user.id, status: "IN_PROGRESS", updated_at: new Date() } }
    );

    if (result.matchedCount === 0) {
      const exists = await tickets.findOne({ _id: Number(id) }, { projection: { _id: 1 } });
      if (!exists) return NextResponse.json({ message: "Ticket not found." }, { status: 404 });
      return NextResponse.json(
        { message: "Ticket is already claimed by another agent." },
        { status: 409 }
      );
    }

    await users.updateOne({ _id: user.id }, { $inc: { tickets_accepted: 1 } });
    await insertDoc(messages, {
      ticket_id: Number(id),
      user_id: user.id,
      author_name: "System",
      author_role: "system",
      message: `Ticket claimed by ${user.fullName}.`,
      is_internal: 1,
    });

    await recordAuditEvent(Number(id), user.id, user.fullName, "TICKET_CLAIMED", `Claimed ticket #${id}`);
    broadcastEvent("ticket_claimed", { ticketId: Number(id), claimedBy: user.fullName });

    try {
      const ticket = await tickets.findOne(
        { _id: Number(id) },
        { projection: { discord_channel_id: 1, telegram_chat_id: 1 } }
      );

      if (ticket) {
        const botPort = process.env.BOT_PORT || "3001";
        fetch(`http://localhost:${botPort}/bot/claim-ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: ticket.discord_channel_id || null,
            chatId: ticket.telegram_chat_id || null,
            userName: user.fullName,
          }),
        }).catch((err) => console.error("Claim bot notification error:", err.message));
      }
    } catch (bridgeErr) {
      console.error("Error triggering claim notifications:", bridgeErr);
    }

    return NextResponse.json({ message: `Ticket claimed by ${user.fullName}!` }, { status: 200 });
  } catch (error: any) {
    console.error("Claim ticket error:", error);
    return NextResponse.json({ message: "Failed to claim ticket." }, { status: 500 });
  }
}