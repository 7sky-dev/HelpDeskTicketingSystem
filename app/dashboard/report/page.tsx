"use client";

import { useState, useEffect } from "react";
import { getClientSession, UserSession } from "@/lib/auth";

interface Ticket {
  id: number;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  customer_name: string;
  customer_email: string;
  assigned_to: string;
  created_at: string;
}

interface Analytics {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  mttrMinutes: number;
  channels: { web: number; discord: number; telegram: number };
}

export default function PrintableReportPage() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = getClientSession();
    setSession(s);

    // Administrator-only report: refresh role from the DB and redirect others.
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setSession(data.user);
          if (data.user.role?.toUpperCase() !== "ADMIN") {
            window.location.href = "/dashboard";
          }
        }
      })
      .catch(() => {});

    Promise.all([
      fetch("/api/tickets").then((r) => r.json()),
      fetch("/api/analytics").then((r) => r.json()),
    ])
      .then(([tData, aData]) => {
        setTickets(tData.tickets || []);
        setAnalytics(aData);
        setLoading(false);

        // Auto trigger window.print() after rendering
        setTimeout(() => {
          window.print();
        }, 600);
      })
      .catch((err) => {
        console.error("Report load error:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-zinc-800 flex items-center justify-center p-8 text-sm font-sans">
        Generating A4 Printable Executive Report...
      </div>
    );
  }

  const generatedAt = new Date().toLocaleString();

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 p-0 sm:p-8 font-sans print:bg-white print:p-0">
      {/* A4 Sheet Wrapper */}
      <div className="max-w-[210mm] mx-auto bg-white p-8 sm:p-12 shadow-xl border border-zinc-200 print:shadow-none print:border-none print:p-0 print:max-w-none">
        
        {/* Print Header */}
        <div className="flex items-center justify-between border-b border-zinc-300 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-indigo-600 text-white font-bold flex items-center justify-center text-sm">
                HD
              </div>
              <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Helpdesk System</h1>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Executive Ticketing & Operations Report</p>
          </div>

          <div className="text-right text-xs text-zinc-600 space-y-0.5">
            <p><span className="font-semibold text-zinc-800">Generated:</span> {generatedAt}</p>
            <p><span className="font-semibold text-zinc-800">Requested By:</span> {session?.fullName || "Administrator"}</p>
            <p><span className="font-semibold text-zinc-800">Format:</span> Official A4 Audit</p>
          </div>
        </div>

        {/* Executive Summary Cards */}
        {analytics && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">System Performance Summary</h2>
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <p className="text-zinc-500 text-[10px]">Total Tickets</p>
                <p className="text-lg font-bold text-zinc-900 mt-0.5">{analytics.total}</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <p className="text-zinc-500 text-[10px]">Active Queue</p>
                <p className="text-lg font-bold text-amber-600 mt-0.5">{analytics.open + analytics.inProgress}</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <p className="text-zinc-500 text-[10px]">Resolved / Closed</p>
                <p className="text-lg font-bold text-emerald-600 mt-0.5">{analytics.resolved + analytics.closed}</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <p className="text-zinc-500 text-[10px]">Avg MTTR</p>
                <p className="text-lg font-bold text-indigo-600 mt-0.5">{analytics.mttrMinutes} min</p>
              </div>
            </div>
          </div>
        )}

        {/* Tickets Overview Table */}
        <div className="mb-8">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
            Tickets Log ({tickets.length} Total Records)
          </h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-zinc-300 text-zinc-600 text-[10px] uppercase tracking-wider bg-zinc-50">
                <th className="py-2 px-2">ID</th>
                <th className="py-2 px-2">Title</th>
                <th className="py-2 px-2">Customer</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Priority</th>
                <th className="py-2 px-2">Assignee</th>
                <th className="py-2 px-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-800 text-[11px]">
              {tickets.map((t) => (
                <tr key={t.id} className="border-b border-zinc-200">
                  <td className="py-2 px-2 font-mono font-bold text-indigo-700">{t.ticket_number}</td>
                  <td className="py-2 px-2 font-medium max-w-[180px] truncate">{t.title}</td>
                  <td className="py-2 px-2">{t.customer_name}</td>
                  <td className="py-2 px-2">
                    <span className="font-semibold uppercase text-[10px]">{t.status}</span>
                  </td>
                  <td className="py-2 px-2 font-semibold text-[10px]">{t.priority}</td>
                  <td className="py-2 px-2">{t.assigned_to}</td>
                  <td className="py-2 px-2 font-mono text-[10px] text-zinc-500">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / Sign-off */}
        <div className="pt-8 border-t border-zinc-300 flex items-center justify-between text-xs text-zinc-500 mt-auto">
          <p>Helpdesk Support System © {new Date().getFullYear()} — Confidential Internal Audit</p>
          <div className="text-right">
            <p className="border-b border-zinc-400 w-36 mb-1 ml-auto" />
            <p className="text-[10px] uppercase text-zinc-400">Authorized Signature</p>
          </div>
        </div>

      </div>

      {/* Screen-only print trigger button */}
      <div className="fixed bottom-6 right-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-2xl transition cursor-pointer flex items-center gap-2"
        >
          🖨️ Re-trigger Print Window
        </button>
      </div>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 15mm;
        }
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
