import { NextResponse } from "next/server";
import { users, tickets } from "@/lib/db";
import { getUserWithFreshRole, isAdmin } from "@/lib/auth-server";

export async function GET(request: Request) {
  try {
    const user = await getUserWithFreshRole(request);
    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    if (!isAdmin(user)) {
      return NextResponse.json(
        { message: "Forbidden. Only administrators can view analytics." },
        { status: 403 }
      );
    }

    const [stats = {} as any] = await tickets
      .aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            openCount: { $sum: { $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0] } },
            inProgressCount: { $sum: { $cond: [{ $eq: ["$status", "IN_PROGRESS"] }, 1, 0] } },
            resolvedCount: { $sum: { $cond: [{ $eq: ["$status", "RESOLVED"] }, 1, 0] } },
            closedCount: { $sum: { $cond: [{ $eq: ["$status", "CLOSED"] }, 1, 0] } },
            discordCount: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$discord_user_id", null] }, null] }, 1, 0] } },
            telegramCount: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$telegram_chat_id", null] }, null] }, 1, 0] } },
            webCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: [{ $ifNull: ["$discord_user_id", null] }, null] },
                      { $eq: [{ $ifNull: ["$telegram_chat_id", null] }, null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray();

    const moderators = await users
      .find(
        {},
        { projection: { _id: 0, id: 1, full_name: 1, email: 1, role: 1, tickets_accepted: 1, tickets_resolved: 1 } }
      )
      .sort({ tickets_resolved: -1, tickets_accepted: -1 })
      .limit(10)
      .toArray();

    const [mttr = {} as any] = await tickets
      .aggregate([
        { $match: { status: { $in: ["RESOLVED", "CLOSED"] } } },
        { $group: { _id: null, avgMs: { $avg: { $subtract: ["$updated_at", "$created_at"] } } } },
      ])
      .toArray();

    return NextResponse.json(
      {
        total: stats.total || 0,
        open: stats.openCount || 0,
        inProgress: stats.inProgressCount || 0,
        resolved: stats.resolvedCount || 0,
        closed: stats.closedCount || 0,
        channels: {
          web: stats.webCount || 0,
          discord: stats.discordCount || 0,
          telegram: stats.telegramCount || 0,
        },
        mttrMinutes: Math.round((mttr.avgMs || 0) / 60000),
        topModerators: moderators,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Analytics fetch error:", error);
    return NextResponse.json({ message: "Failed to fetch analytics." }, { status: 500 });
  }
}