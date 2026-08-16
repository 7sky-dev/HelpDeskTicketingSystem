export interface UserSession {
  id: number;
  fullName: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
}

export const AUTH_COOKIE_NAME = "auth_token";
export const AUTH_STORAGE_KEY = "helpdesk_user";

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function getClientSession(): UserSession | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) return JSON.parse(stored);

    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${AUTH_COOKIE_NAME}=`));

    if (match) {
      const rawVal = decodeURIComponent(match.split("=")[1]);
      const dataPart = rawVal.includes(".") ? rawVal.split(".")[0] : rawVal;
      const decodedJson = decodeBase64Url(dataPart);
      if (decodedJson) {
        return JSON.parse(decodedJson);
      }
    }
  } catch (e) {
    console.error("Auth session parse error:", e);
  }

  return null;
}

export function setClientSession(user: UserSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

export function clearClientSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
