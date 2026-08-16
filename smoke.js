// Smoke test for the MongoDB swap: `node smoke.js` (app must be running on :3000, MongoDB on :27017)
const BASE = process.env.BASE_URL || "http://localhost:3000";

let n = 0;
function check(label, cond, extra = "") {
  n++;
  if (!cond) {
    console.error(`✗ ${label} ${extra}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: setCookie.split(";")[0] };
}

async function main() {
  // auth first — most endpoints now require an authenticated session
  const login = await api("/api/auth/login", { method: "POST", body: { email: "admin@helpdesk.com", password: "password123" } });
  check("admin login", login.status === 200 && login.json.user?.role === "ADMIN", JSON.stringify(login.json));
  const cookie = login.cookie;
  const me = await api("/api/auth/me", { cookie });
  check("session restored", me.json.user?.id === login.json.user?.id);

  // seeded data
  const seeded = await api("/api/tickets", { cookie });
  check("seeded tickets listed", seeded.json.tickets?.length >= 2, JSON.stringify(seeded.json).slice(0, 200));
  check("tickets sorted newest first", new Date(seeded.json.tickets[0].created_at) >= new Date(seeded.json.tickets.at(-1).created_at));
  check("ticket ids are numbers", typeof seeded.json.tickets[0].id === "number");

  const dup = await api("/api/auth/register", { method: "POST", body: { fullName: "X", email: "admin@helpdesk.com", password: "password123" } });
  check("duplicate email rejected", dup.status === 409);
  const reg = await api("/api/auth/register", { method: "POST", body: { fullName: "New User", email: `new${Date.now()}@x.com`, password: "secret123" } });
  check("register assigns numeric id", reg.status === 201 && typeof reg.json.userId === "number", JSON.stringify(reg.json));
  check("self-registration stays USER (no privilege escalation)", reg.json.user?.role === "USER", JSON.stringify(reg.json));
  const shortPw = await api("/api/auth/register", { method: "POST", body: { fullName: "Short", email: `short${Date.now()}@x.com`, password: "short1" } });
  check("short password rejected", shortPw.status === 400, JSON.stringify(shortPw.json));

  // create + filters
  const created = await api("/api/tickets", {
    method: "POST",
    cookie,
    body: { title: "Smoke", description: "desc", customerName: "C", customerEmail: "c@x.com" },
  });
  check("ticket created", created.status === 201 && typeof created.json.ticketId === "number", JSON.stringify(created.json));
  const tid = created.json.ticketId;

  const pool = await api("/api/tickets?pool=true", { cookie });
  check("pool = unassigned & open only", pool.json.tickets.every((t) => t.assigned_to === "Unassigned" || t.assigned_user_id === null));
  const mine = await api("/api/tickets?assignedUserId=1", { cookie });
  check("filter by numeric assignedUserId", Array.isArray(mine.json.tickets));

  const modOf = async (id) => (await api("/api/analytics", { cookie })).json.topModerators.find((u) => u.id === id);
  const acceptedBefore = (await modOf(login.json.user.id))?.tickets_accepted;
  const resolvedBefore = (await modOf(login.json.user.id))?.tickets_resolved;

  // claim
  const claim = await api(`/api/tickets/${tid}/claim`, { method: "POST", cookie });
  check("claim", claim.status === 200, JSON.stringify(claim.json));
  const claimed = (await api("/api/tickets", { cookie })).json.tickets.find((t) => t.id === tid);
  check("claim persisted", claimed.assigned_to === "Admin Alex" && claimed.status === "IN_PROGRESS", JSON.stringify(claimed));
  const doubleClaim = await api(`/api/tickets/${tid}/claim`, { method: "POST", cookie });
  check("double claim blocked", doubleClaim.status === 409, JSON.stringify(doubleClaim.json));
  const mod = await modOf(login.json.user.id);
  check("tickets_accepted incremented", mod.tickets_accepted === acceptedBefore + 1, JSON.stringify(mod));

  // responses
  const resp = await api(`/api/tickets/${tid}/responses`, { method: "POST", cookie, body: { message: "hello there" } });
  check("response posted", resp.status === 201, JSON.stringify(resp.json));
  const list = await api(`/api/tickets/${tid}/responses`, { cookie });
  check(
    "response listed (claim system msg + mine)",
    list.json.responses?.length === 2 && list.json.responses.some((m) => m.message === "hello there"),
    JSON.stringify(list.json)
  );
  check("response has created_at", !!list.json.responses[0]?.created_at);

  // update to RESOLVED -> tickets_resolved++
  const upd = await api(`/api/tickets/${tid}`, { method: "PUT", cookie, body: { status: "RESOLVED" } });
  check("update", upd.status === 200, JSON.stringify(upd.json));
  const mod2 = await modOf(login.json.user.id);
  check("tickets_resolved incremented", mod2.tickets_resolved === resolvedBefore + 1, JSON.stringify(mod2));

  // analytics + audit are ADMIN-only
  const an = await api("/api/analytics", { cookie });
  check("analytics counts", an.json.total >= 3 && an.json.resolved >= 1, JSON.stringify(an.json));
  check("analytics mttr", typeof an.json.mttrMinutes === "number", JSON.stringify(an.json.mttrMinutes));
  check("analytics omits password", !JSON.stringify(an.json.topModerators).includes("$2b$"));

  const logs = await api("/api/audit-logs", { cookie });
  const actions = logs.json.auditLogs?.map((l) => l.action) || [];
  check("audit logs recorded", ["TICKET_CREATED", "TICKET_CLAIMED", "MESSAGE_SENT", "TICKET_UPDATED"].every((a) => actions.includes(a)), JSON.stringify(actions));
  check("audit logs sorted newest first", new Date(logs.json.auditLogs[0].created_at) >= new Date(logs.json.auditLogs.at(-1).created_at));

  // delete (admin only)
  const del = await api(`/api/tickets/${tid}`, { method: "DELETE", cookie });
  check("delete", del.status === 200, JSON.stringify(del.json));
  check("messages cascade-deleted", ((await api(`/api/tickets/${tid}/responses`, { cookie })).json.responses || []).length === 0);
  check("gone", (await api("/api/tickets", { cookie })).json.tickets.every((t) => t.id !== tid));

  const forbidden = await api(`/api/tickets/1`, { method: "DELETE" });
  check("unauthenticated delete blocked", forbidden.status === 401);

  console.log(`\n${n} checks, ${process.exitCode ? "FAILURES" : "all passed"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});