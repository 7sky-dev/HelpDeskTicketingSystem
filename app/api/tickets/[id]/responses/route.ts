import { NextResponse } from "next/server";
import { tickets, messages, insertDoc } from "@/lib/db";
import { getUserWithFreshRole, isStaff, roleOf } from "@/lib/auth-server";
import { recordAuditEvent } from "@/lib/audit-log";
import { broadcastEvent } from "@/app/api/events/route";

function canViewTicket(ticket: { assigned_user_id?: number | null; assigned_to?: string | null }, user: { id: number }) {
  if (!ticket) return false;
  const unclaimed =
    !ticket.assigned_user_id ||
    !ticket.assigned_to ||
    ticket.assigned_to === "Unassigned";
  return unclaimed || ticket.assigned_user_id === user.id;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getUserWithFreshRole(request);
    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

    const ticket = await tickets.findOne(
      { _id: Number(id) },
      { projection: { assigned_user_id: 1, assigned_to: 1 } }
    );
    if (!ticket) return NextResponse.json({ message: "Ticket not found." }, { status: 404 });

    if (!isStaff(user) && !canViewTicket(ticket, user)) {
      return NextResponse.json(
        { message: "You do not have access to this ticket." },
        { status: 403 }
      );
    }

    const rows = await messages.find({ ticket_id: Number(id) }).sort({ created_at: 1 }).toArray();

    return NextResponse.json({ responses: rows }, { status: 200 });
  } catch (error: any) {
    console.error("Fetch ticket responses error:", error);
    return NextResponse.json({ message: "Failed to fetch responses." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getUserWithFreshRole(request);
    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { message, isInternal } = body;

    const senderName = user.fullName;
    const senderRole = user.role.toLowerCase();

    if (!message || !senderName) {
      return NextResponse.json({ message: "Message content and author name required." }, { status: 400 });
    }

    const ticket = await tickets.findOne(
      { _id: Number(id) },
      { projection: { assigned_to: 1, assigned_user_id: 1, discord_channel_id: 1, telegram_chat_id: 1 } }
    );
    if (!ticket) return NextResponse.json({ message: "Ticket not found." }, { status: 404 });

    // Permissions:
    // - Administrator / Moderator: may respond to ANY ticket, claimed or not.
    // - User: must have claimed this ticket first (unclaimed tickets require claiming).
    if (roleOf(user) === "USER" && ticket.assigned_user_id !== user.id) {
      return NextResponse.json(
        { message: "You must claim this ticket before sending messages." },
        { status: 403 }
      );
    }

    const responseId = await insertDoc(messages, {
      ticket_id: Number(id),
      user_id: user.id,
      author_name: senderName,
      author_role: senderRole,
      message,
      is_internal: isInternal ? 1 : 0,
    });

    await tickets.updateOne(
      { _id: Number(id), status: "OPEN" },
      { $set: { status: "IN_PROGRESS", updated_at: new Date() } }
    );

    await recordAuditEvent(
      Number(id),
      user.id,
      senderName,
      isInternal ? "INTERNAL_NOTE_ADDED" : "MESSAGE_SENT",
      message.slice(0, 100)
    );

    broadcastEvent("message_added", { ticketId: Number(id), authorName: senderName, message });

    if (!isInternal && (ticket.discord_channel_id || ticket.telegram_chat_id)) {
      const botPort = process.env.BOT_PORT || "3001";
      try {
        await fetch(`http://localhost:${botPort}/bot/send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: ticket.discord_channel_id || null,
            chatId: ticket.telegram_chat_id || null,
            message,
            authorName: senderName,
            authorRole: senderRole,
          }),
        }).catch((err) => console.error("Failed to relay message to Bot HTTP Bridge:", err.message));
      } catch (bridgeErr) {
        console.error("Error triggering Bot Bridge:", bridgeErr);
      }
    }

    return NextResponse.json({ message: "Response added successfully!", responseId }, { status: 201 });
  } catch (error: any) {
    console.error("Post response error:", error);
    return NextResponse.json({ message: "Failed to post response." }, { status: 500 });
  }
}