import { NextResponse } from "next/server";
import { tickets, messages, users } from "@/lib/db";
import { getUserWithFreshRole, roleOf } from "@/lib/auth-server";
import { recordAuditEvent } from "@/lib/audit-log";
import { broadcastEvent } from "@/app/api/events/route";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getUserWithFreshRole(request);

    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { status, priority, assignedTo, assignedUserId } = body;

    if (!id) return NextResponse.json({ message: "Ticket ID required." }, { status: 400 });

    const ticket = await tickets.findOne(
      { _id: Number(id) },
      { projection: { assigned_user_id: 1 } }
    );
    if (!ticket) return NextResponse.json({ message: "Ticket not found." }, { status: 404 });

    if (roleOf(user) === "USER") {
      // Users may only touch tickets they personally claimed, and only their status.
      if (ticket.assigned_user_id !== user.id) {
        return NextResponse.json(
          { message: "You can only update tickets you have claimed and been assigned to." },
          { status: 403 }
        );
      }
      if (priority !== undefined || assignedTo !== undefined || assignedUserId !== undefined) {
        return NextResponse.json(
          { message: "Users may only change the status of their claimed tickets." },
          { status: 403 }
        );
      }
    }

    const updates: Record<string, any> = {};

    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (assignedTo !== undefined) updates.assigned_to = assignedTo;
    if (assignedUserId !== undefined) updates.assigned_user_id = assignedUserId ? Number(assignedUserId) : null;

    if (Object.keys(updates).length === 0) return NextResponse.json({ message: "No update fields provided." }, { status: 400 });

    updates.updated_at = new Date();
    await tickets.updateOne({ _id: Number(id) }, { $set: updates });

    await recordAuditEvent(Number(id), user.id, user.fullName, "TICKET_UPDATED", `Updated status=${status || 'unchanged'}, priority=${priority || 'unchanged'}`);
    broadcastEvent("ticket_updated", { ticketId: Number(id), status, priority });

    if (status === "RESOLVED") {
      const t = await tickets.findOne(
        { _id: Number(id) },
        { projection: { ticket_number: 1, assigned_to: 1, assigned_user_id: 1, discord_channel_id: 1, telegram_chat_id: 1 } }
      );

      if (t) {
        if (t.assigned_user_id) {
          await users.updateOne({ _id: t.assigned_user_id }, { $inc: { tickets_resolved: 1 } });
        }

        const botPort = process.env.BOT_PORT || "3001";
        fetch(`http://localhost:${botPort}/bot/resolve-ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: t.discord_channel_id || null,
            chatId: t.telegram_chat_id || null,
            ticketNumber: t.ticket_number,
            resolvedBy: t.assigned_to || user.fullName,
          }),
        }).catch((err) => console.error("Notify Bot Bridge on resolve error:", err.message));
      }
    }

    return NextResponse.json({ message: "Ticket updated successfully!" }, { status: 200 });
  } catch (error: any) {
    console.error("Update ticket error:", error);
    return NextResponse.json({ message: "Failed to update ticket." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getUserWithFreshRole(request);

    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    if (roleOf(user) !== "ADMIN") {
      return NextResponse.json(
        { message: "Forbidden. Only administrators can permanently delete tickets." },
        { status: 403 }
      );
    }

    if (!id) return NextResponse.json({ message: "Ticket ID required." }, { status: 400 });

    const ticket = await tickets.findOne(
      { _id: Number(id) },
      { projection: { ticket_number: 1, discord_channel_id: 1, telegram_chat_id: 1 } }
    );

    await messages.deleteMany({ ticket_id: Number(id) });

    const result = await tickets.deleteOne({ _id: Number(id) });

    if (result.deletedCount === 0) return NextResponse.json({ message: "Ticket not found." }, { status: 404 });

    await recordAuditEvent(Number(id), user.id, user.fullName, "TICKET_DELETED", `Deleted ticket #${id}`);
    broadcastEvent("ticket_deleted", { ticketId: Number(id) });

    if (ticket) {
      const botPort = process.env.BOT_PORT || "3001";

      try {
        await fetch(`http://localhost:${botPort}/bot/delete-ticket-channel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: ticket.discord_channel_id || null,
            chatId: ticket.telegram_chat_id || null,
            ticketNumber: ticket.ticket_number,
            deletedBy: user.fullName,
          }),
        }).catch((err) => console.error("Bot channel/telegram deletion error:", err.message));
      } catch (bridgeErr) {
        console.error("Error triggering Bot Bridge on delete:", bridgeErr);
      }
    }

    return NextResponse.json({ message: "Ticket deleted successfully!" }, { status: 200 });
  } catch (error: any) {
    console.error("Delete ticket error:", error);
    return NextResponse.json({ message: "Failed to delete ticket." }, { status: 500 });
  }
}