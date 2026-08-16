import { NextResponse } from "next/server";
import { getUserWithFreshRole } from "@/lib/auth-server";

export async function GET(request: Request) {
  const user = await getUserWithFreshRole(request);
  return NextResponse.json({ user }, { status: 200 });
}
