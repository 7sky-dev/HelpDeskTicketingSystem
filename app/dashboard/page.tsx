"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getClientSession, setClientSession, clearClientSession, UserSession } from "@/lib/auth";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  MODERATOR: "Moderator",
  USER: "User",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  MODERATOR: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  USER: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

const STATUS_STYLES: Record<Ticket["status"], string> = {
  OPEN: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  IN_PROGRESS: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  RESOLVED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  CLOSED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const PRIORITY_DOTS: Record<Ticket["priority"], string> = {
  URGENT: "bg-rose-500",
  HIGH: "bg-amber-400",
  MEDIUM: "bg-sky-400",
  LOW: "bg-zinc-500",
};

const titleCase = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace("_", " ");

function roleLabel(role?: string) {
  const key = String(role || "").toUpperCase();
  return ROLE_LABELS[key] || role || "User";
}

function roleColor(role?: string) {
  const key = String(role || "").toUpperCase();
  return ROLE_COLORS[key] || ROLE_COLORS.USER;
}

export interface Ticket {
  id: number;
  ticket_number: string;
  title: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  category: string;
  customer_name: string;
  customer_email: string;
  discord_user_id?: string | null;
  telegram_chat_id?: string | null;
  assigned_to: string;
  assigned_user_id?: number | null;
  created_at: string;
}

export interface TicketResponse {
  id: number;
  ticket_id: number;
  user_id: number | null;
  author_name: string;
  author_role: string;
  message: string;
  is_internal: number;
  created_at: string;
}

export interface AnalyticsData {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  channels: { web: number; discord: number; telegram: number };
  mttrMinutes: number;
  topModerators: Array<{ id?: number; email: string; full_name: string; role: string; tickets_accepted: number; tickets_resolved: number }>;
}

export interface AuditLog {
  id: number;
  ticket_id: number | null;
  actor_name: string;
  action: string;
  details: string | null;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"tickets" | "analytics" | "audit">("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"all" | "pool" | "my">("all");

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [responses, setResponses] = useState<TicketResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [newResponseMessage, setNewResponseMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingResponse, setSendingResponse] = useState(false);

  // New Ticket Form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCategory, setNewCategory] = useState("Technical");
  const [newPriority, setNewPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Auth Protection
  useEffect(() => {
    const checkAuth = async () => {
      let currentSession = getClientSession();
      try {
        // Always refresh from the server so the displayed role matches MongoDB (not a stale cache).
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            currentSession = data.user;
            setClientSession(data.user);
          }
        }
      } catch {}

      if (!currentSession) {
        router.replace("/login");
      } else {
        setSession(currentSession);
        setAuthLoading(false);
        if ((currentSession.role || "").toLowerCase() === "moderator") {
          setViewMode("pool");
        }
      }
    };

    checkAuth();
  }, [router]);

  // Fetch Data Functions
  const fetchTickets = async (showLoading = true) => {
    if (showLoading) setLoadingTickets(true);
    try {
      const res = await fetch("/api/tickets");
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error("Fetch tickets error:", err);
    } finally {
      if (showLoading) setLoadingTickets(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error("Fetch analytics error:", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await fetch("/api/audit-logs");
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error("Fetch audit logs error:", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Real-time SSE Connection + Fallback Polling
  useEffect(() => {
    if (!session) return;
    fetchTickets(true);

    const eventSource = new EventSource("/api/events");
    eventSource.onopen = () => setIsRealtime(true);
    eventSource.onerror = () => setIsRealtime(false);

    const handleUpdate = () => {
      fetchTickets(false);
      if (activeTab === "analytics") fetchAnalytics();
      if (activeTab === "audit") fetchAuditLogs();
    };

    eventSource.addEventListener("ticket_created", handleUpdate);
    eventSource.addEventListener("ticket_claimed", handleUpdate);
    eventSource.addEventListener("ticket_updated", handleUpdate);
    eventSource.addEventListener("ticket_deleted", handleUpdate);
    eventSource.addEventListener("message_added", handleUpdate);
    eventSource.addEventListener("audit_log", handleUpdate);

    const interval = setInterval(() => {
      fetchTickets(false);
      if (activeTab === "analytics") fetchAnalytics();
      if (activeTab === "audit") fetchAuditLogs();
    }, 2500);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [session, activeTab]);

  useEffect(() => {
    if (activeTab === "analytics") fetchAnalytics();
    if (activeTab === "audit") fetchAuditLogs();
  }, [activeTab]);

  // Responses
  const fetchResponses = async (ticketId: number) => {
    setLoadingResponses(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/responses`);
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses || []);
      }
    } catch (err) {
      console.error("Fetch responses error:", err);
    } finally {
      setLoadingResponses(false);
    }
  };

  const handleSelectTicket = (t: Ticket) => {
    setSelectedTicket(t);
    fetchResponses(t.id);
  };

  const handleClaimTicket = async (id: number) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/tickets/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.id, userName: session.fullName }),
      });
      if (res.ok) {
        fetchTickets(false);
        if (selectedTicket && selectedTicket.id === id) {
          setSelectedTicket({
            ...selectedTicket,
            assigned_to: session.fullName,
            assigned_user_id: session.id,
            status: "IN_PROGRESS",
          });
          fetchResponses(id);
        }
      }
    } catch (err) {
      console.error("Claim ticket error:", err);
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchTickets(false);
        if (selectedTicket && selectedTicket.id === id) {
          setSelectedTicket({ ...selectedTicket, status: status as any });
        }
      }
    } catch (err) {
      console.error("Update status error:", err);
    }
  };

  const handleDeleteTicket = async (id: number, ticketNumber?: string) => {
    if (!confirm(`Delete ticket ${ticketNumber || ""} permanently?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletedBy: session?.fullName || "Administrator" }),
      });
      if (res.ok) {
        if (selectedTicket?.id === id) setSelectedTicket(null);
        fetchTickets(false);
      }
    } catch (err) {
      console.error("Delete ticket error:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePostResponse = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !newResponseMessage.trim() || !session) return;
    setSendingResponse(true);

    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.id,
          authorName: session.fullName,
          authorRole: session.role,
          message: newResponseMessage,
          isInternal: isInternalNote,
        }),
      });

      if (res.ok) {
        setNewResponseMessage("");
        fetchResponses(selectedTicket.id);
        fetchTickets(false);
      }
    } catch (err) {
      console.error("Post response error:", err);
    } finally {
      setSendingResponse(false);
    }
  };

  const handleCreateTicket = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDescription || !newCustomerName || !newCustomerEmail) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          priority: newPriority,
          category: newCategory,
          customerName: newCustomerName,
          customerEmail: newCustomerEmail,
        }),
      });

      if (res.ok) {
        setIsCreateModalOpen(false);
        setNewTitle("");
        setNewDescription("");
        setNewCustomerName("");
        setNewCustomerEmail("");
        fetchTickets(true);
      }
    } catch (err) {
      console.error("Create ticket error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const exportCSV = () => {
    const headers = [
      "Numer Ticketu",
      "Tytul",
      "Klient",
      "Email Klienta",
      "Status",
      "Priorytet",
      "Kategoria",
      "Przypisana Osoba",
      "Data Utworzenia",
    ];

    const rows = tickets.map((t) => [
      t.ticket_number,
      `"${(t.title || "").replace(/"/g, '""')}"`,
      `"${(t.customer_name || "").replace(/"/g, '""')}"`,
      `"${(t.customer_email || "").replace(/"/g, '""')}"`,
      t.status,
      t.priority,
      `"${(t.category || "").replace(/"/g, '""')}"`,
      `"${(t.assigned_to || "").replace(/"/g, '""')}"`,
      `"${new Date(t.created_at).toLocaleString("pl-PL")}"`,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `raport_ticketow_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading Helpdesk...</div>;
  }

  const userIsAdmin = String(session?.role || "").toUpperCase() === "ADMIN";

  const filteredTickets = tickets.filter((t) => {
    if (viewMode === "pool" && (t.assigned_to !== "Unassigned" && t.assigned_to !== null && t.assigned_user_id !== null)) return false;
    if (viewMode === "my" && session && t.assigned_user_id !== session.id) return false;
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.ticket_number.toLowerCase().includes(q) ||
        t.customer_name.toLowerCase().includes(q) ||
        t.customer_email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg">HD</div>
          <span className="font-bold text-base text-zinc-100 tracking-tight">Helpdesk System</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 ${isRealtime ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRealtime ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            {isRealtime ? "Realtime Sync" : "Polling Mode"}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-zinc-200">{session?.fullName}</p>
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border mt-0.5 ${roleColor(session?.role)}`}>
              {roleLabel(session?.role)}
            </span>
          </div>
          <button
            onClick={() => {
              clearClientSession();
              fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
            }}
            className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700/60 transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Tab Controls */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/30 px-6 py-2 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("tickets")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "tickets" ? "bg-indigo-600 text-white shadow-md" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"}`}
          >
            🎫 Tickets Queue ({tickets.length})
          </button>

          {userIsAdmin && (
            <>
              <button
                onClick={() => setActiveTab("analytics")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "analytics" ? "bg-indigo-600 text-white shadow-md" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"}`}
              >
                📊 Analytics & Metrics
              </button>

              <button
                onClick={() => setActiveTab("audit")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "audit" ? "bg-indigo-600 text-white shadow-md" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"}`}
              >
                📜 Audit History
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {userIsAdmin && (
            <>
              <button
                onClick={exportCSV}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition cursor-pointer flex items-center gap-1.5"
              >
                📥 Export CSV
              </button>
              <button
                onClick={() => window.open("/dashboard/report", "_blank")}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition cursor-pointer flex items-center gap-1.5"
              >
                🖨️ Print Report
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {activeTab === "tickets" && (
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80 shadow-md">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${viewMode === "all" ? "bg-zinc-800 text-zinc-100 border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  All Tickets
                </button>
                <button
                  onClick={() => setViewMode("pool")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${viewMode === "pool" ? "bg-zinc-800 text-zinc-100 border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  Unassigned Queue
                </button>
                <button
                  onClick={() => setViewMode("my")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${viewMode === "my" ? "bg-zinc-800 text-zinc-100 border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  Assigned To Me
                </button>
              </div>

              <div className="flex items-center gap-3 flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search tickets by ID, customer name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition cursor-pointer shadow-md"
              >
                + Create Ticket
              </button>
            </div>

            {/* Tickets Table */}
            <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-x-auto shadow-lg">
              {loadingTickets ? (
                <div className="p-12 text-center text-zinc-500 text-xs">Loading queue...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 text-xs space-y-3">
                  <p>No tickets match your filters.</p>
                  {(searchQuery || statusFilter !== "ALL" || viewMode !== "all") && (
                    <button
                      onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); setViewMode("all"); }}
                      className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px] bg-zinc-900/80">
                      <th className="py-3 px-4">Ticket</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Assignee</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredTickets.map((t) => (
                      <tr key={t.id} className="hover:bg-zinc-800/40 transition cursor-pointer" onClick={() => router.push(`/dashboard/tickets/${t.id}`)}>
                        <td className="py-3.5 px-4">
                          <Link href={`/dashboard/tickets/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-indigo-400 font-bold hover:underline">
                            {t.ticket_number}
                          </Link>
                          <p className="font-medium text-zinc-200 mt-0.5 max-w-xs truncate">{t.title}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-zinc-200">{t.customer_name}</p>
                          <p className="text-[11px] text-zinc-400">{t.customer_email}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${STATUS_STYLES[t.status] || STATUS_STYLES.CLOSED}`}>
                            {titleCase(t.status)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-300">
                            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOTS[t.priority] || PRIORITY_DOTS.LOW}`} />
                            {titleCase(t.priority)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300">
                          {t.assigned_to !== "Unassigned" ? (
                            <span className="font-medium">{t.assigned_to}</span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleClaimTicket(t.id); }}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 transition cursor-pointer"
                            >
                              Claim Ticket
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {userIsAdmin && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteTicket(t.id, t.ticket_number); }}
                              disabled={deletingId === t.id}
                              className="text-xs text-rose-400 hover:text-rose-300 transition cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Performance & SLA Metrics</h2>

            {loadingAnalytics ? (
              <div className="p-12 text-center text-zinc-500 text-xs">Computing analytics...</div>
            ) : analytics ? (
              <div className="space-y-6">
                {/* Metric Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                    <p className="text-zinc-500 text-[11px]">Total Tickets</p>
                    <p className="text-2xl font-bold text-zinc-100 mt-1">{analytics.total}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                    <p className="text-amber-400 text-[11px]">Active Open Tickets</p>
                    <p className="text-2xl font-bold text-amber-300 mt-1">{analytics.open + analytics.inProgress}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                    <p className="text-emerald-400 text-[11px]">Resolved / Closed</p>
                    <p className="text-2xl font-bold text-emerald-300 mt-1">{analytics.resolved + analytics.closed}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                    <p className="text-sky-400 text-[11px]">Avg Resolution Time (MTTR)</p>
                    <p className="text-2xl font-bold text-sky-300 mt-1">{analytics.mttrMinutes} min</p>
                  </div>
                </div>

                {/* Channels Breakdown */}
                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Inbound Channels Distribution</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <p className="text-[11px] text-zinc-400">Web Portal</p>
                      <p className="text-lg font-bold text-zinc-200 mt-0.5">{analytics.channels.web}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                      <p className="text-[11px] text-indigo-400">Discord Bot</p>
                      <p className="text-lg font-bold text-indigo-300 mt-0.5">{analytics.channels.discord}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
                      <p className="text-[11px] text-sky-400">Telegram Bot</p>
                      <p className="text-lg font-bold text-sky-300 mt-0.5">{analytics.channels.telegram}</p>
                    </div>
                  </div>
                </div>

                {/* Top Moderators */}
                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Moderator Leaderboard</h3>
                  <div className="space-y-2">
                    {analytics.topModerators.map((m) => (
                      <div key={m.id ?? m.email} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
                        <div>
                          <span className="font-bold text-zinc-200">{m.full_name}</span>
                          <span className="text-[10px] text-zinc-500 uppercase ml-2">({m.role})</span>
                        </div>
                        <div className="flex items-center gap-4 text-zinc-400">
                          <span>Claimed: <strong className="text-zinc-200">{m.tickets_accepted}</strong></span>
                          <span>Resolved: <strong className="text-emerald-400">{m.tickets_resolved}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === "audit" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">System Audit Trail</h2>
            <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-hidden shadow-lg">
              {loadingAudit ? (
                <div className="p-12 text-center text-zinc-500 text-xs">Loading audit logs...</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 text-xs">No audit logs recorded yet.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px] bg-zinc-900/80">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Ticket ID</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-zinc-200">{log.actor_name}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-indigo-300 border border-zinc-700">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400">{log.ticket_id ? `#${log.ticket_id}` : "-"}</td>
                        <td className="py-3 px-4 text-zinc-400 truncate max-w-xs">{log.details || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Create Ticket Modal */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsCreateModalOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setIsCreateModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100">Create New Support Ticket</h3>
              <button onClick={() => setIsCreateModalOpen(false)} aria-label="Close" className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3">
              <div>
                <label className="text-[11px] text-zinc-400">Title</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400">Description</label>
                <textarea
                  required
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400">Customer Email</label>
                  <input
                    type="email"
                    required
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 mt-1 cursor-pointer"
                  >
                    {["Technical", "Account Access", "Billing", "Feature Request", "General Support"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as Ticket["priority"])}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 mt-1 cursor-pointer"
                  >
                    {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                      <option key={p} value={p}>{titleCase(p)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white cursor-pointer"
                >
                  {submitting ? "Creating..." : "Submit Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
