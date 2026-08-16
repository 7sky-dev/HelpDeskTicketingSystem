import { NextResponse } from "next/server";
import { tickets, insertDoc } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit-log";
import { broadcastEvent } from "@/app/api/events/route";
import { getUserWithFreshRole, isStaff } from "@/lib/auth-server";

export async function GET(request: Request) {
  try {
    const user = await getUserWithFreshRole(request);
    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const pool = searchParams.get("pool");
    const assignedUserId = searchParams.get("assignedUserId");

    const filter: Record<string, unknown> = {};

    if (isStaff(user)) {
      // Moderator/Administrator: full visibility, supports all queue filters.
      if (pool === "true") {
        filter.$or = [{ assigned_to: "Unassigned" }, { assigned_to: null }, { assigned_user_id: null }];
        filter.status = { $ne: "CLOSED" };
      } else if (assignedUserId) {
        filter.assigned_user_id = Number(assignedUserId);
      }
    } else {
      // User: ONLY the unclaimed pool plus tickets they personally claimed.
      // Other agents' assignments and resolved/closed matter is never exposed.
      filter.$or = [
        { $or: [{ assigned_to: "Unassigned" }, { assigned_to: null }, { assigned_user_id: null }] },
        { assigned_user_id: user.id },
      ];
      filter.status = { $ne: "CLOSED" };
    }

    const rows = await tickets.find(filter).sort({ created_at: -1 }).toArray();
    return NextResponse.json({ tickets: rows }, { status: 200 });
  } catch (error: any) {
    console.error("Fetch tickets error:", error);
    return NextResponse.json({ message: "Failed to fetch tickets.", error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserWithFreshRole(request);
    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { title, description, priority, category, customerName, customerEmail, assignedTo, assignedUserId, discordUserId, discordChannelId } = body;

    if (!title || !description || !customerName || !customerEmail) {
      return NextResponse.json({ message: "Title, description, customer name, and customer email required." }, { status: 400 });
    }

    const ticketNumber = `TK-${Math.floor(1000 + Math.random() * 9000)}`;

    const ticketId = await insertDoc(tickets, {
      ticket_number: ticketNumber,
      title,
      description,
      status: "OPEN",
      priority: priority || "MEDIUM",
      category: category || "General Support",
      customer_name: customerName,
      customer_email: customerEmail,
      discord_user_id: discordUserId || null,
      discord_channel_id: discordChannelId || null,
      assigned_to: assignedTo || "Unassigned",
      assigned_user_id: assignedUserId ? Number(assignedUserId) : null,
    });

    await recordAuditEvent(ticketId, assignedUserId ? Number(assignedUserId) : null, customerName, "TICKET_CREATED", `Created ticket #${ticketNumber}: ${title}`);
    broadcastEvent("ticket_created", { ticketId, ticketNumber, title });

    return NextResponse.json({ message: "Ticket created successfully!", ticketId, ticketNumber }, { status: 201 });
  } catch (error: any) {
    console.error("Create ticket error:", error);
    return NextResponse.json({ message: "Failed to create ticket.", error: error.message }, { status: 500 });
  }
}