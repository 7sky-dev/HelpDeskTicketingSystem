import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { users } from "@/lib/db";
import { signToken, ServerUserSession } from "@/lib/auth-server";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json().catch(() => ({}));

    if (!email || !password) {
      return NextResponse.json({ message: "Email and password required." }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await users.findOne(
      { email: cleanEmail },
      { projection: { id: 1, full_name: 1, email: 1, password: 1, role: 1 } }
    );

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
    }

    const userPayload: ServerUserSession = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: (user.role || "MODERATOR").toUpperCase() as "USER" | "MODERATOR" | "ADMIN",
    };

    const token = signToken(userPayload);
    const response = NextResponse.json({ message: "Login successful!", user: userPayload }, { status: 200 });

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 604800,
      sameSite: "lax",
    });

    return response;
  } catch (error: unknown) {
    console.error("Login error:", error);
    return NextResponse.json({ message: "Login failed." }, { status: 500 });
  }
}