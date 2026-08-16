import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { users, insertDoc } from "@/lib/db";
import { signToken, ServerUserSession } from "@/lib/auth-server";

export async function POST(request: Request) {
  try {
    const { fullName, email, password } = await request.json().catch(() => ({}));

    // Security: self-registration ALWAYS grants the lowest privilege (USER).
    // MODERATOR/ADMIN roles are granted manually (see seed.js / direct DB edit)
    // so public registration can never be used to escalate privileges.
    const safeRole = "USER" as const;

    if (!fullName || !email || !password) {
      return NextResponse.json({ message: "All fields required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ message: "Password must be at least 8 characters." }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await users.findOne({ email: cleanEmail });

    if (existing) {
      return NextResponse.json({ message: "Email already exists." }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = await insertDoc(users, {
      full_name: String(fullName).trim(),
      email: cleanEmail,
      password: hashedPassword,
      role: safeRole,
      discord_user_id: null,
      tickets_accepted: 0,
      tickets_resolved: 0,
    });

    const userPayload: ServerUserSession = {
      id: userId,
      fullName: String(fullName).trim(),
      email: cleanEmail,
      role: safeRole,
    };

    const token = signToken(userPayload);
    const response = NextResponse.json({ message: "Registered successfully!", userId, user: userPayload }, { status: 201 });

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 604800,
      sameSite: "lax",
    });

    return response;
  } catch (error: unknown) {
    console.error("Registration error:", error);
    return NextResponse.json({ message: "Registration failed." }, { status: 500 });
  }
}