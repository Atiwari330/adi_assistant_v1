"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.status === "ok") {
        const items = data.pipeline?.actionItemsCreated ?? 0;
        setSyncResult(items > 0 ? `${items} new items` : "Up to date");
        // Reload the page to show new items
        if (items > 0) {
          window.location.reload();
        }
      } else {
        setSyncResult("Sync failed");
      }
    } catch {
      setSyncResult("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 3000);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white safe-top">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">Adi Assistant</h1>
          <div className="flex items-center gap-3">
            {syncResult && (
              <span className="text-xs text-slate-400">{syncResult}</span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync"}
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:text-slate-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 pb-20">
        {children}
      </main>

      {/* Bottom navigation — mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm safe-bottom">
        <div className="mx-auto flex max-w-2xl">
          <NavLink href="/dashboard" label="Action Items" active={pathname === "/dashboard"} />
          <NavLink href="/settings" label="Settings" active={pathname === "/settings"} />
        </div>
      </nav>
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
        active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {label}
    </Link>
  );
}
