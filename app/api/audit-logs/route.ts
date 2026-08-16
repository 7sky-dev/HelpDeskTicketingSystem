import { NextResponse } from "next/server";
import { auditLogs } from "@/lib/db";
import { getUserWithFreshRole, isAdmin } from "@/lib/auth-server";

export async function GET(request: Request) {
  try {
    const user = await getUserWithFreshRole(request);
    if (!user) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    if (!isAdmin(user)) {
      return NextResponse.json(
        { message: "Forbidden. Only administrators can view audit logs." },
        { status: 403 }
      );
    }

    const rows = await auditLogs.find().sort({ created_at: -1 }).limit(100).toArray();

    return NextResponse.json({ auditLogs: rows }, { status: 200 });
  } catch (error: any) {
    console.error("Audit logs fetch error:", error);
    return NextResponse.json({ message: "Failed to fetch audit logs." }, { status: 500 });
  }
}