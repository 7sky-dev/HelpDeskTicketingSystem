"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getClientSession, clearClientSession, UserSession } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeInteractiveTab, setActiveInteractiveTab] = useState<"discord" | "triage" | "notes" | "architecture">("discord");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Check auth for header state without auto-redirecting so the portfolio can be freely demonstrated
  // ponytail: keeping session in client state without SSR auth check on landing -> upgrade path: middleware session validation when landing requires personalized server components
  useEffect(() => {
    const user = getClientSession();
    if (user) {
      setSession(user);
    }
  }, []);

  const handleSignOut = async () => {
    clearClientSession();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.error("Sign out error:", e);
    }
    setSession(null);
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-amber-500 selection:text-black">
      {/* Background Ambience Radial Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-yellow-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      </div>

      {/* Top Banner for Logged-In Sessions */}
      {session && (
        <div className="relative z-50 bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-200">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Signed in as <strong className="text-white">{session.fullName}</strong> ({session.role})</span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="font-bold text-amber-400 hover:text-amber-300 underline"
              >
                Go to Workspace →
              </Link>
              <button
                onClick={handleSignOut}
                className="text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header / Navigation Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/85 border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg sm:text-xl tracking-tight text-white group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-yellow-500 to-amber-600 flex items-center justify-center text-black shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform font-black">
              <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2 2 2 0 00-2 2v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 00-2-2 2 2 0 000-4 2 2 0 002-2V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <span>
              Ticketing<span className="text-amber-400">HQ</span>
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs lg:text-sm font-medium text-zinc-300">
            <a href="#showcase" className="hover:text-amber-400 transition-colors">Interactive Demo</a>
            <a href="#architecture" className="hover:text-amber-400 transition-colors">Architecture</a>
            <a href="#features" className="hover:text-amber-400 transition-colors">Features</a>
            <a href="#about" className="hover:text-amber-400 transition-colors">Developer Profile</a>
            <a href="#faq" className="hover:text-amber-400 transition-colors">FAQ</a>
          </nav>

          {/* Direct Auth Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] cursor-pointer"
              >
                Open Workspace →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3.5 py-1.5 text-xs font-semibold text-zinc-300 hover:text-amber-400 transition-colors cursor-pointer"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] cursor-pointer"
                >
                  Create Account
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-zinc-950/98 border-b border-zinc-800 px-4 pt-3 pb-6 space-y-3">
            <a
              href="#showcase"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-zinc-200 hover:bg-zinc-900 hover:text-amber-400"
            >
              Interactive Demo
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-zinc-200 hover:bg-zinc-900 hover:text-amber-400"
            >
              System Architecture
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-zinc-200 hover:bg-zinc-900 hover:text-amber-400"
            >
              Features
            </a>
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-zinc-200 hover:bg-zinc-900 hover:text-amber-400"
            >
              Developer Profile
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-zinc-200 hover:bg-zinc-900 hover:text-amber-400"
            >
              FAQ
            </a>
            <div className="pt-3 border-t border-zinc-800 flex flex-col gap-2">
              {session ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-sm"
                >
                  Open Dashboard Workspace
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center px-4 py-2 rounded-xl text-zinc-200 bg-zinc-900 border border-zinc-800 text-sm font-medium"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-sm"
                  >
                    Create Account
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 md:pt-20 md:pb-28 overflow-hidden z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Engineering Showcase Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-semibold mb-6">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Full-Stack Engineering Showcase by Piotr Kapeluszny</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-300 hidden sm:inline">Next.js 16 + MongoDB + Discord.js</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-[1.15]">
            Full-Stack Helpdesk Engine with{" "}
            <span className="bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
              Real-Time Discord Bot Sync.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-5 text-base sm:text-lg lg:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            A production-ready ticketing platform built from scratch. Features multi-role moderator pools, live bidirectional Discord channel threads, bcrypt authentication, and MongoDB document persistence.
          </p>

          {/* Call-to-Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 max-w-md mx-auto">
            <Link
              href={session ? "/dashboard" : "/login"}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-sm shadow-xl shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] text-center"
            >
              {session ? "Enter Ticket Dashboard →" : "Launch Live Workspace Demo →"}
            </Link>
            <a
              href="https://github.com/7sky-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 font-semibold text-sm transition-all flex items-center justify-center gap-2 group hover:border-amber-500/50"
            >
              <svg className="w-4 h-4 fill-current text-zinc-400 group-hover:text-white transition-colors" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>Inspect on GitHub</span>
            </a>
          </div>

          {/* Engineering Highlights Bar */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-8 border-t border-zinc-800/80">
            <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60">
              <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">100%</p>
              <p className="text-xs text-zinc-400 mt-0.5">Strict TypeScript Coverage</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60">
              <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">2-Way</p>
              <p className="text-xs text-zinc-400 mt-0.5">Discord Bot Live Relay</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60">
              <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">MongoDB</p>
              <p className="text-xs text-zinc-400 mt-0.5">ACID Relational Storage</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60">
              <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">RBAC</p>
              <p className="text-xs text-zinc-400 mt-0.5">Admin & Moderator Roles</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Feature & Architecture Showcase */}
      <section id="showcase" className="py-16 relative z-10 bg-zinc-950/90 border-t border-zinc-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h2 className="text-xs font-bold tracking-widest text-amber-400 uppercase">Live Technical Showcase</h2>
            <p className="mt-2 text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Explore How the Platform Works Under the Hood
            </p>
            <p className="mt-3 text-zinc-400 text-xs sm:text-sm">
              Click through the interactive modules to see how customer messages, Discord events, and moderator pools connect in real-time.
            </p>
          </div>

          {/* Interactive Navigation Pills */}
          <div className="flex justify-center mb-8 gap-1.5 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800 max-w-xl mx-auto overflow-x-auto">
            <button
              onClick={() => setActiveInteractiveTab("discord")}
              className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeInteractiveTab === "discord"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              🤖 Discord Relay
            </button>
            <button
              onClick={() => setActiveInteractiveTab("triage")}
              className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeInteractiveTab === "triage"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              🎟️ Pool & Triage
            </button>
            <button
              onClick={() => setActiveInteractiveTab("notes")}
              className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeInteractiveTab === "notes"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              🔒 Internal Notes
            </button>
            <button
              onClick={() => setActiveInteractiveTab("architecture")}
              className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeInteractiveTab === "architecture"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              ⚙️ Architecture
            </button>
          </div>

          {/* Tab Showcase Card */}
          <div className="rounded-2xl p-2 sm:p-3 bg-gradient-to-b from-amber-500/20 via-zinc-800/40 to-zinc-900/80 border border-amber-500/30 shadow-2xl backdrop-blur-xl">
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-5 sm:p-8">
              {activeInteractiveTab === "discord" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                      Module 01: Bi-directional Discord Bridge
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-white">
                      Instant sync between Discord channels and Web agents
                    </h3>
                    <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                      When a customer opens a ticket or sends a message in Discord, the Discord.js daemon creates a dedicated ticket thread, writes directly to MongoDB, and notifies active web agents. Replies typed in the web dashboard mirror back into the customer's Discord channel seamlessly.
                    </p>
                    <div className="space-y-2 text-xs text-zinc-300">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Zero-latency WebSocket event listeners on Discord guild channels</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Channel auto-archiving upon ticket resolution</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Author attribution distinguishes bot, user, and web moderators</span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Discord to Web Relay Mockup */}
                  <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-[11px]">
                      <span className="text-indigo-400 font-bold">#ticket-tk-1049 (Discord)</span>
                      <span className="text-emerald-400 text-[10px]">● Live Bot Connected</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="font-bold text-indigo-300">Discord User @Alex</span>
                        <span>14:02:11</span>
                      </div>
                      <p className="text-zinc-200">"Payment succeeded on Stripe but dashboard shows trial expired."</p>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-amber-400 text-[11px] py-1 font-sans font-bold">
                      <span>↓ MongoDB write & polling sync ↓</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-amber-400">
                        <span className="font-bold">Web Moderator (Piotr)</span>
                        <span>14:02:45</span>
                      </div>
                      <p className="text-amber-100 font-sans">"Checking transaction logs right now Alex, stand by!"</p>
                    </div>
                  </div>
                </div>
              )}

              {activeInteractiveTab === "triage" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                      Module 02: Moderator Claim Pool
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-white">
                      Eliminate duplicate replies with atomic ticket claiming
                    </h3>
                    <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                      Unassigned tickets land into the shared moderator pool. Any moderator can claim a ticket with a single click, assigning their session ID and preventing collision between team members.
                    </p>
                    <div className="space-y-2 text-xs text-zinc-300">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Atomic MongoDB update to lock tickets to the claiming agent</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Dynamic role filtering: Pool vs Claimed by Me vs All Tickets</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Automatic status transition from OPEN to IN_PROGRESS upon claim</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span className="text-amber-400 font-bold">Queue Simulation</span>
                      <span className="text-zinc-500 text-[11px]">3 Unassigned</span>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-950 border border-amber-500/40 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white text-xs">#TK-8021 • Database Connection Timeout</p>
                        <p className="text-[11px] text-zinc-400">Customer: sarah@acme.com • Urgent</p>
                      </div>
                      <button className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs shadow-sm">
                        Claim Ticket
                      </button>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-between opacity-70">
                      <div>
                        <p className="font-semibold text-zinc-300 text-xs">#TK-8020 • Invoice address mismatch</p>
                        <p className="text-[11px] text-zinc-500">Customer: dev@startup.io • Low</p>
                      </div>
                      <span className="text-[11px] text-zinc-400 font-mono">In Pool</span>
                    </div>
                  </div>
                </div>
              )}

              {activeInteractiveTab === "notes" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                      Module 03: Private Staff Notes
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-white">
                      Confidential communication shielded from customers
                    </h3>
                    <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                      Staff members can toggle "Internal Staff Note" when replying. Internal notes are saved with `is_internal = 1`, styled with distinctive amber warning styling, and never sent to the customer or relayed into Discord channels.
                    </p>
                    <div className="space-y-2 text-xs text-zinc-300">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Server-side filtering guarantees zero note leaks to Discord bots</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Center-aligned highlighted callouts in the agent messenger</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 space-y-1">
                      <div className="flex items-center justify-between font-bold text-amber-400 text-[11px]">
                        <span>🔒 Staff Note • Senior Lead (Piotr)</span>
                        <span className="font-mono text-zinc-500">14:15</span>
                      </div>
                      <p>"User account is flagged for manual verification. Do not refund before fraud review."</p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 space-y-1">
                      <div className="flex items-center justify-between font-bold text-zinc-200 text-[11px]">
                        <span>Public Reply to Customer</span>
                        <span className="font-mono text-zinc-500">14:18</span>
                      </div>
                      <p>"Hi Mark, our security team is currently reviewing your account details. We will update you shortly!"</p>
                    </div>
                  </div>
                </div>
              )}

              {activeInteractiveTab === "architecture" && (
                <div className="space-y-6">
                  <div className="text-left space-y-2">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                      Module 04: System Architecture Diagram
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-white">
                      End-to-End Technology Stack & Data Flow
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
                    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                      <span className="text-xs font-mono font-bold text-amber-400">01. Frontend</span>
                      <h4 className="font-bold text-white text-sm">Next.js 16 App Router</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        React 19 Server & Client components with Tailwind CSS v4 for zero-runtime styling overhead.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                      <span className="text-xs font-mono font-bold text-amber-400">02. API Layer</span>
                      <h4 className="font-bold text-white text-sm">Route Handlers</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        RESTful Next.js endpoints for ticket CRUD, authentication, claiming, and thread polling.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                      <span className="text-xs font-mono font-bold text-amber-400">03. Persistence</span>
                      <h4 className="font-bold text-white text-sm">MongoDB Database</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Document collections for `tickets`, `messages`, `users` and `audit_logs`.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                      <span className="text-xs font-mono font-bold text-amber-400">04. Automation</span>
                      <h4 className="font-bold text-white text-sm">Discord Bot Daemon</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Discord.js daemon listening to guild channels and synchronizing bidirectional replies.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Core Engineering Features Grid */}
      <section id="features" className="py-16 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-xs font-bold tracking-widest text-amber-400 uppercase">Core Capabilities</h2>
            <p className="mt-2 text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Engineering Features Designed for High Reliability
            </p>
            <p className="mt-3 text-zinc-400 text-xs sm:text-sm">
              Built following standard-library and platform-native conventions, minimizing dependencies while maximizing performance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Bcrypt Password Hashing</h3>
              <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                Robust password security using bcrypt with salted hashes stored directly in MongoDB, preventing credential disclosure.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Multi-Tier RBAC</h3>
              <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                Role-based permission gating for Administrators, Support Moderators, and standard Customer accounts.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Real-Time Polling Engine</h3>
              <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                Silent background auto-refresh prevents jarring screen flickers while keeping tickets and chat messages synchronized.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">SLA Priority Tiers</h3>
              <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                Categorize issues by URGENT, HIGH, MEDIUM, and LOW priority with visual color tokens and quick-filtering tools.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Discord Channel Sync</h3>
              <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                Automatic thread provisioning and lifecycle cleanup when tickets are resolved or deleted by administrators.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Relational Foreign Keys</h3>
              <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                Cascading deletes and transactional consistency across tickets and messages ensure a clean database state.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Developer Profile & Portfolio Card */}
      <section id="about" className="py-16 relative z-10 bg-zinc-950/80 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-tr from-zinc-900 via-zinc-950 to-zinc-900 border border-amber-500/30 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-500 to-amber-600 flex items-center justify-center text-black font-black text-3xl shadow-xl shadow-amber-500/20 shrink-0">
                PK
              </div>

              <div className="space-y-4 text-center md:text-left flex-1">
                <div>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                    <h3 className="text-2xl font-black text-white">Piotr Kapeluszny</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Full-Stack Software Engineer
                    </span>
                  </div>
                  <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                    Specialized in Next.js, Node.js microservices, TypeScript, database architecture, and realtime integrations.
                  </p>
                </div>

                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  "This project was created to demonstrate clean full-stack architectural principles: avoiding bloated dependencies, maintaining end-to-end type safety, implementing resilient Discord bot webhooks, and crafting a responsive, intuitive moderator experience."
                </p>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                  <a
                    href="https://github.com/7sky-dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span>GitHub @7sky-dev</span>
                  </a>

                  <a
                    href="https://www.linkedin.com/in/piotr-kapeluszny-a31507274/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-amber-500/20"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                    </svg>
                    <span>LinkedIn Profile</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-16 relative z-10 bg-zinc-950/60 border-t border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-xs font-bold tracking-widest text-amber-400 uppercase">Architecture & FAQ</h2>
            <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Technical Questions & Details</p>
          </div>

          <div className="space-y-3">
            {[
              {
                q: "What tech stack powers this project?",
                a: "Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, MongoDB document database, Discord.js v14 gateway daemon, and bcryptjs for salted password security."
              },
              {
                q: "How does the Discord synchronization work?",
                a: "The Node.js discord.js bot daemon runs alongside Next.js. Incoming Discord forum/channel messages trigger automated database inserts, and moderator replies from the web dashboard write back through the Discord REST API to the corresponding channel."
              },
              {
                q: "How is state management handled?",
                a: "The project follows senior pragmatic principles: standard React hooks (useState, useEffect), URL search parameters, and lightweight interval polling, avoiding heavy redundant state library overhead (like Redux or Zustand)."
              }
            ].map((faq, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-4 text-left font-semibold text-white flex items-center justify-between gap-4 hover:text-amber-400 transition-colors text-xs sm:text-sm cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform ${openFaq === idx ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-4 text-xs sm:text-sm text-zinc-400 leading-relaxed border-t border-zinc-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950 py-10 relative z-10 text-zinc-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500 text-black font-black flex items-center justify-center text-xs">
              TK
            </div>
            <span className="font-bold text-white">TicketingHQ</span>
            <span className="text-zinc-600">•</span>
            <span>Portfolio Project by Piotr Kapeluszny</span>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="https://github.com/7sky-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-400 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/piotr-kapeluszny-a31507274/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-400 transition-colors"
            >
              LinkedIn
            </a>
            <Link href="/login" className="hover:text-amber-400 transition-colors">
              Workspace Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
