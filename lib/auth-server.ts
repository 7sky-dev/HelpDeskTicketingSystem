import crypto from "crypto";
import { users } from "@/lib/db";

// ponytail: HMAC-SHA256 token signing using stdlib crypto -> upgrade to RSA/ECDSA asymmetric JWT if multi-service auth verification needed

// Resolve the signing secret lazily so a missing/weak value fails at request time
// (with a clear message) instead of silently falling back to a public default.
let cachedSecret: string | null = null;
function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is required and must be at least 32 characters. " +
        "Add it to .env.local, e.g. `SESSION_SECRET=$(openssl rand -hex 32)`."
    );
  }
  cachedSecret = secret;
  return secret;
}

export interface ServerUserSession {
  id: number;
  fullName: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
}

export type RoleName = "USER" | "MODERATOR" | "ADMIN";

export function roleOf(user: ServerUserSession | null | undefined): RoleName {
  const role = String(user?.role || "").toUpperCase();
  return role === "ADMIN" || role === "MODERATOR" ? role : "USER";
}

export function isAdmin(user: ServerUserSession | null | undefined): boolean {
  return roleOf(user) === "ADMIN";
}

// Staff can manage any ticket without claiming: ADMIN and MODERATOR.
export function isStaff(user: ServerUserSession | null | undefined): boolean {
  return roleOf(user) === "ADMIN" || roleOf(user) === "MODERATOR";
}

export function signToken(payload: ServerUserSession): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${hmac}`;
}

export function verifyToken(token: string): ServerUserSession | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [data, hmac] = parts;
  try {
    const expectedHmac = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
    const hmacBuffer = Buffer.from(hmac);
    const expectedBuffer = Buffer.from(expectedHmac);

    if (hmacBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(hmacBuffer, expectedBuffer)) return null;

    return JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

export function getAuthUser(request: Request): ServerUserSession | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.split("; ").find((row) => row.startsWith("auth_token="));
  if (!match) return null;

  const rawToken = match.split("=")[1];
  if (!rawToken) return null;

  return verifyToken(decodeURIComponent(rawToken));
}

// Resolve the user from the token, then overlay the CURRENT role/name from MongoDB so
// the UI always reflects the live database instead of a stale signed-token snapshot.
export async function getUserWithFreshRole(request: Request): Promise<ServerUserSession | null> {
  const session = getAuthUser(request);
  if (!session) return null;

  try {
    const row = await users.findOne(
      { _id: session.id },
      { projection: { full_name: 1, email: 1, role: 1 } }
    );
    if (row) {
      return {
        id: session.id,
        fullName: row.full_name || session.fullName,
        email: row.email || session.email,
        role: String(row.role || session.role || "USER").toUpperCase() as ServerUserSession["role"],
      };
    }
  } catch (err) {
    console.error("Failed to load fresh user role from DB:", err);
  }

  return session;
}
