"use client";

import { useState, useEffect, useRef, FormEvent, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getClientSession, setClientSession, UserSession } from "@/lib/auth";

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
  discord_channel_id?: string | null;
  telegram_chat_id?: string | null;
  telegram_user_id?: string | null;
  assigned_to: string;
  assigned_user_id?: number | null;
  created_at: string;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  user_id: number | null;
  author_name: string;
  author_role: string;
  message: string;
  is_internal: number;
  created_at: string;
}

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const ticketId = resolvedParams.id;
  const router = useRouter();

  const [session, setSession] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingTicket, setLoadingTicket] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const [newMessage, setNewMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDetailsOpenMobile, setIsDetailsOpenMobile] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkAuth = async () => {
      let currentSession = getClientSession();
      try {
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
      }
    };

    checkAuth();
  }, [router]);

  const fetchTicket = async () => {
    try {
      const res = await fetch("/api/tickets");
      if (res.ok) {
        const data = await res.json();
        const found = (data.tickets || []).find(
          (t: Ticket) => String(t.id) === String(ticketId)
        );
        if (found) {
          setTicket(found);
        }
      }
    } catch (err) {
      console.error("Error fetching ticket details:", err);
    } finally {
      setLoadingTicket(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/responses`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.responses || []);
      }
    } catch (err) {
      console.error("Error fetching ticket messages:", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // ponytail: 3s polling for bidirectional Discord & web replies -> upgrade path: WebSockets or Discord bot gateway webhooks when ticket traffic scales
  useEffect(() => {
    if (!authLoading && session) {
      fetchTicket();
      fetchMessages();

      const eventSource = new EventSource("/api/events");
      const handleSync = () => {
        fetchTicket();
        fetchMessages();
      };

      eventSource.addEventListener("message_added", handleSync);
      eventSource.addEventListener("ticket_updated", handleSync);

      const interval = setInterval(() => {
        fetchMessages();
      }, 3000);

      return () => {
        eventSource.close();
        clearInterval(interval);
      };
    }
  }, [authLoading, session, ticketId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleClaimTicket = async () => {
    if (!session || !ticket) return;
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.id,
          userName: session.fullName,
        }),
      });

      if (res.ok) {
        fetchTicket();
        fetchMessages();
      }
    } catch (err) {
      console.error("Error claiming ticket:", err);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!ticket) return;
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setTicket({ ...ticket, status: newStatus as Ticket["status"] });
        fetchMessages();
      }
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const handleDeleteTicket = async () => {
    if (!ticket) return;
    if (
      !confirm(
        `Are you sure you want to permanently delete ticket ${ticket.ticket_number} and remove its linked Discord channel?`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletedBy: session?.fullName || "Administrator" }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.message || "Failed to delete ticket.");
        setIsDeleting(false);
      }
    } catch (err) {
      console.error("Error deleting ticket:", err);
      alert("Failed to delete ticket.");
      setIsDeleting(false);
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || !ticket || !newMessage.trim()) return;

    if (isUnassigned && isUser) {
      alert("You must claim this ticket before sending a message.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.id,
          authorName: session.fullName,
          authorRole: session.role,
          message: newMessage,
          isInternal: isInternalNote,
        }),
      });

      if (res.ok) {
        setNewMessage("");
        setIsInternalNote(false);
        fetchMessages();
        fetchTicket();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.message || "Failed to send response.");
      }
    } catch (err) {
      console.error("Error sending response:", err);
    } finally {
      setSending(false);
    }
  };

  if (authLoading || !session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-400 flex flex-col items-center justify-center gap-3 font-mono text-sm">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        <p>Loading ticket workspace session...</p>
      </div>
    );
  }

  if (loadingTicket && !ticket) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-400 flex flex-col items-center justify-center gap-3 font-mono text-sm">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin" />
        <p>Fetching ticket details #{ticketId}...</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white">Ticket #{ticketId} Not Found</h1>
        <p className="text-xs text-zinc-400 max-w-sm">
          The requested ticket does not exist or may have been deleted from the database.
        </p>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:text-amber-400 transition-colors"
        >
          ← Return to Dashboard
        </Link>
      </div>
    );
  }

  const isUnassigned =
    ticket.assigned_to === "Unassigned" ||
    !ticket.assigned_to ||
    ticket.assigned_user_id === null;

  const isAdmin =
    String(session?.role || "").toUpperCase() === "ADMIN";
  const isUser =
    String(session?.role || "").toUpperCase() === "USER";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col selection:bg-amber-500 selection:text-black">
      {/* Top Messenger Bar */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-3 sm:px-6 py-3 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-amber-400 hover:border-amber-500/40 transition-all cursor-pointer shrink-0 flex items-center gap-1"
              title="Return to tickets list"
            >
              <span>←</span>
              <span className="hidden sm:inline">Dashboard</span>
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-amber-400 text-sm shrink-0">
                  {ticket.ticket_number}
                </span>

                <span
                  className={`px-2 py-0.2 rounded text-[10px] font-bold border shrink-0 ${
                    ticket.priority === "URGENT"
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                      : ticket.priority === "HIGH"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                  }`}
                >
                  {ticket.priority}
                </span>

                <select
                  value={ticket.status}
                  onChange={(e) => handleUpdateStatus(e.target.value)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border bg-zinc-900 cursor-pointer focus:outline-none focus:border-amber-500 ${
                    ticket.status === "RESOLVED"
                      ? "text-emerald-400 border-emerald-500/30"
                      : ticket.status === "OPEN"
                      ? "text-amber-400 border-amber-500/30"
                      : "text-blue-400 border-blue-500/30"
                  }`}
                >
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>

                {ticket.discord_channel_id && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Discord Sync
                  </span>
                )}
              </div>

              <h1 className="text-xs sm:text-sm font-bold text-white truncate mt-0.5" title={ticket.title}>
                {ticket.title}
              </h1>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0 justify-end">
            <button
              onClick={() => setIsDetailsOpenMobile(!isDetailsOpenMobile)}
              className="lg:hidden px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white"
            >
              {isDetailsOpenMobile ? "Hide Details" : "Ticket Details"}
            </button>

            {isUnassigned ? (
              <button
                onClick={handleClaimTicket}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                ✋ Claim Ticket
              </button>
            ) : (
              ticket.status !== "RESOLVED" && (
                <button
                  onClick={() => handleUpdateStatus("RESOLVED")}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Resolve</span>
                </button>
              )
            )}

            {isAdmin && (
              <button
                onClick={handleDeleteTicket}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                title="Permanently delete ticket & Discord channel"
              >
                {isDeleting ? (
                  <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
                <span>{isDeleting ? "Deleting..." : "Delete Ticket"}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
        {/* Mobile Expandable Details (Shown when toggled on mobile) */}
        {isDetailsOpenMobile && (
          <div className="lg:hidden p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Ticket Overview</h3>
            <div className="text-xs text-zinc-300 space-y-1">
              <p><span className="text-zinc-500">Customer:</span> {ticket.customer_name} ({ticket.customer_email})</p>
              <p><span className="text-zinc-500">Category:</span> {ticket.category}</p>
              <p><span className="text-zinc-500">Assigned To:</span> {ticket.assigned_to || "Unassigned"}</p>
              <p><span className="text-zinc-500">Created:</span> {new Date(ticket.created_at).toLocaleString()}</p>
            </div>
            <div className="pt-2 border-t border-zinc-800 text-xs text-zinc-300">
              <p className="text-zinc-500 mb-1">Issue Description:</p>
              <p className="whitespace-pre-wrap bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80">{ticket.description}</p>
            </div>
          </div>
        )}

        {/* Messenger Column (2 cols on desktop) */}
        <div className="lg:col-span-2 flex flex-col h-[calc(100vh-140px)] min-h-[500px] bg-zinc-900/70 border border-zinc-800/90 rounded-2xl overflow-hidden shadow-2xl">
          {/* Chat Messages Scrollable Area */}
          <div className="flex-1 p-3 sm:p-6 overflow-y-auto space-y-3.5">
            {/* Initial Ticket Description Banner as Chat Root */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-1.5 shadow-sm">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-amber-400 uppercase tracking-wider">Original Ticket Issue</span>
                <span className="text-zinc-500 font-mono">
                  {new Date(ticket.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <h2 className="text-sm font-bold text-white">{ticket.title}</h2>
              <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed pt-1">
                {ticket.description}
              </p>
            </div>

            {loadingMessages && messages.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                Loading live chat conversation...
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs italic">
                No replies posted yet. Send a message below to start communicating with the customer.
              </div>
            ) : (
              messages.map((m) => {
                const roleLower = (m.author_role || "").toLowerCase();
                const isCustomer = roleLower === "user" || roleLower === "customer";
                const isInternal = m.is_internal === 1;

                if (isInternal) {
                  return (
                    <div key={m.id} className="flex justify-center w-full my-3">
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs max-w-xl w-full space-y-1.5 shadow-sm">
                        <div className="flex items-center justify-between font-bold text-amber-400 text-[11px]">
                          <span className="flex items-center gap-1.5">
                            🔒 Internal Staff Note • {m.author_name} ({m.author_role.toUpperCase()})
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed text-amber-100">{m.message}</p>
                      </div>
                    </div>
                  );
                }

                if (!isCustomer) {
                  // Staff Message (Right side)
                  const initials = m.author_name.slice(0, 2).toUpperCase();
                  return (
                    <div key={m.id} className="flex justify-end gap-2.5 w-full my-2.5">
                      <div className="flex flex-col items-end max-w-sm sm:max-w-md md:max-w-lg">
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-zinc-400">
                          <span className="font-bold text-zinc-100">{m.author_name}</span>
                          <span className="text-[9px] font-bold text-indigo-300 uppercase bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/30">
                            {m.author_role}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-2xl rounded-tr-xs bg-indigo-600 text-white font-medium text-xs sm:text-sm leading-relaxed shadow-lg shadow-indigo-600/10">
                          <p className="whitespace-pre-wrap">{m.message}</p>
                        </div>
                      </div>

                      <div className="w-8 h-8 rounded-full bg-indigo-600 border border-indigo-400/40 flex items-center justify-center font-bold text-xs text-white shrink-0 mt-5">
                        {initials}
                      </div>
                    </div>
                  );
                }

                // Customer Message (Left side)
                const initials = m.author_name.slice(0, 2).toUpperCase();
                return (
                  <div key={m.id} className="flex justify-start gap-2.5 w-full my-2.5">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-300 shrink-0 mt-5">
                      {initials}
                    </div>

                    <div className="flex flex-col items-start max-w-sm sm:max-w-md md:max-w-lg">
                      <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-zinc-400">
                        <span className="font-bold text-zinc-200">{m.author_name}</span>
                        <span className="text-[9px] font-bold text-zinc-400 uppercase bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                          Customer
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-2xl rounded-tl-xs bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs sm:text-sm leading-relaxed shadow-md">
                        <p className="whitespace-pre-wrap">{m.message}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Response Input */}
          {isUnassigned && isUser ? (
            <div className="p-4 bg-zinc-950/90 border-t border-zinc-800 space-y-3 shrink-0">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center space-y-2.5">
                <p className="text-xs text-amber-300 font-medium">
                  ⚠️ This ticket is unassigned. Claim it before sending messages to the customer.
                </p>
                <button
                  type="button"
                  onClick={handleClaimTicket}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-md transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  ✋ Claim Ticket to Enable Chat
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSendMessage}
              className="p-3 sm:p-4 bg-zinc-950/90 border-t border-zinc-800 space-y-3 shrink-0"
            >
              {/* Quick Canned Responses */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                <span className="text-zinc-500 font-medium shrink-0">Quick Templates:</span>
                <button
                  type="button"
                  onClick={() => setNewMessage("Hello! Thank you for contacting support. How can we assist you today?")}
                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition cursor-pointer shrink-0"
                >
                  👋 Greeting
                </button>
                <button
                  type="button"
                  onClick={() => setNewMessage("We are currently investigating your issue and will get back to you shortly.")}
                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition cursor-pointer shrink-0"
                >
                  🔍 Investigating
                </button>
                <button
                  type="button"
                  onClick={() => setNewMessage("We have resolved this issue for you. Please let us know if you need anything else!")}
                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition cursor-pointer shrink-0"
                >
                  ✅ Resolved
                </button>
              </div>

              <textarea
                rows={2}
                required
                placeholder={isInternalNote ? "Write a private internal note for staff only..." : "Write a response to the customer..."}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    handleSendMessage(e);
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border text-zinc-100 placeholder-zinc-500 focus:outline-none text-xs sm:text-sm transition-all resize-none ${isInternalNote ? "border-amber-500/50 focus:border-amber-500 bg-amber-500/5" : "border-zinc-800 focus:border-indigo-500"}`}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                    className="rounded border-zinc-800 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className={isInternalNote ? "text-amber-400 font-bold" : ""}>
                    🔒 Private Internal Note (Staff only)
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 hidden sm:inline">Ctrl + Enter to send</span>
                  <button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className={`px-5 py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isInternalNote ? "bg-amber-600 hover:bg-amber-500" : "bg-indigo-600 hover:bg-indigo-500"}`}
                  >
                    {sending ? "Sending..." : isInternalNote ? "Post Internal Note" : "Send Response"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Desktop Sidebar (1 col on desktop) */}
        <aside className="hidden lg:flex flex-col gap-4">
          {/* Customer & Ticket Card */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4 shadow-lg">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Customer Profile
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                <p className="text-zinc-500 text-[11px]">Customer Name</p>
                <p className="font-bold text-white text-sm mt-0.5">{ticket.customer_name}</p>
                <p className="text-zinc-400 mt-0.5">{ticket.customer_email}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                  <p className="text-zinc-500 text-[11px]">Category</p>
                  <p className="font-bold text-zinc-200 mt-0.5">{ticket.category}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                  <p className="text-zinc-500 text-[11px]">Assigned Moderator</p>
                  <p className={`font-bold mt-0.5 ${isUnassigned ? "text-amber-400" : "text-emerald-400"}`}>
                    {ticket.assigned_to || "Unassigned"}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                <p className="text-zinc-500 text-[11px]">Created At</p>
                <p className="text-zinc-300 font-mono text-[11px] mt-0.5">
                  {new Date(ticket.created_at).toLocaleString()}
                </p>
              </div>

              {ticket.discord_user_id && (
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200">
                  <p className="text-[11px] font-bold flex items-center gap-1.5 text-indigo-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Discord Integrated
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">Discord ID: {ticket.discord_user_id}</p>
                  {ticket.discord_channel_id && (
                    <p className="text-[11px] text-zinc-400">Channel ID: {ticket.discord_channel_id}</p>
                  )}
                </div>
              )}

              {ticket.telegram_chat_id && (
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-200">
                  <p className="text-[11px] font-bold flex items-center gap-1.5 text-sky-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Telegram Integrated
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">Chat ID: {ticket.telegram_chat_id}</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Resolution Card */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3 shadow-lg">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Workflow Status
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When the problem is resolved, mark the ticket as resolved to notify the customer and close the active SLA cycle.
            </p>
            {ticket.status !== "RESOLVED" ? (
              <button
                onClick={() => handleUpdateStatus("RESOLVED")}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                Mark Ticket as Resolved
              </button>
            ) : (
              <button
                onClick={() => handleUpdateStatus("OPEN")}
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Reopen Ticket
              </button>
            )}
          </div>

          {/* Admin Controls */}
          {session.role?.toUpperCase() === "ADMIN" && (
            <div className="p-5 rounded-2xl bg-zinc-900/80 border border-rose-500/30 space-y-3 shadow-lg">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Admin Actions
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Permanently delete this ticket from the database and automatically delete its Discord channel.
              </p>
              <button
                onClick={handleDeleteTicket}
                className="w-full py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Ticket & Discord Channel
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
