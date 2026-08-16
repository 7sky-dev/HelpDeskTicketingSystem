import { auditLogs, insertDoc } from "@/lib/db";
import { broadcastEvent } from "@/app/api/events/route";

export async function recordAuditEvent(
  ticketId: number | null,
  userId: number | null,
  actorName: string,
  action: string,
  details?: string
) {
  try {
    await insertDoc(auditLogs, {
      ticket_id: ticketId,
      user_id: userId,
      actor_name: actorName,
      action,
      details: details || null,
    });

    // Broadcast SSE real-time event
    broadcastEvent("audit_log", { ticketId, actorName, action, details, timestamp: new Date() });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}