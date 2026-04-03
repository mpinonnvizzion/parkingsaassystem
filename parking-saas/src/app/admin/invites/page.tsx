"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";

type Invite = {
  id: string;
  email: string;
  token: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

export default function AdminInvitesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Check if current user is a platform admin
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    async function checkAdmin() {
      const { data } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!data) {
        router.push("/properties");
        return;
      }
      setIsAdmin(true);
    }

    checkAdmin();
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInvites = useCallback(async () => {
    setIsLoadingInvites(true);
    const { data } = await supabase
      .from("org_invites")
      .select("id, email, token, created_at, expires_at, used_at")
      .order("created_at", { ascending: false });

    setInvites((data as Invite[]) ?? []);
    setIsLoadingInvites(false);
  }, [supabase]);

  useEffect(() => {
    if (isAdmin) loadInvites();
  }, [isAdmin, loadInvites]);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    const { data, error } = await supabase.rpc("create_org_invite", {
      p_email: newEmail.trim().toLowerCase(),
    });

    if (error || !data || data.length === 0) {
      setCreateError(error?.message ?? "Failed to create invite.");
      setIsCreating(false);
      return;
    }

    setNewEmail("");
    setIsCreating(false);
    loadInvites();
  }

  function buildInviteUrl(token: string) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    return `${base}/signup?token=${token}`;
  }

  async function copyToClipboard(token: string) {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // fallback
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function isExpired(expires_at: string) {
    return new Date(expires_at) < new Date();
  }

  // ── Loading / access check ─────────────────────────────────────────────
  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  // ── Main page ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/properties")}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Dashboard
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-900">Admin — Invites</span>
        </div>
        <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2.5 py-1 font-medium">
          Platform Admin
        </span>
      </header>

      <main className="max-w-3xl mx-auto py-10 px-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Property Manager Invites</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate invite links to onboard new property managers. Each link is single-use and expires in 7 days.
          </p>
        </div>

        {/* Create invite form */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Create new invite</h2>
          <form onSubmit={handleCreateInvite} className="flex gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              placeholder="manager@example.com"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={isCreating}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isCreating ? "Generating..." : "Generate invite"}
            </button>
          </form>
          {createError && (
            <p className="mt-2 text-sm text-red-600">{createError}</p>
          )}
        </div>

        {/* Invites table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Invite history</h2>
          </div>

          {isLoadingInvites ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">Loading invites...</div>
          ) : invites.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No invites yet. Generate your first one above.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {invites.map((invite) => {
                const used = !!invite.used_at;
                const expired = !used && isExpired(invite.expires_at);

                return (
                  <li key={invite.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{invite.email}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Sent {formatDate(invite.created_at)} · Expires {formatDate(invite.expires_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Status badge */}
                      {used ? (
                        <span className="text-xs bg-green-50 text-green-700 rounded-full px-2.5 py-1 font-medium">
                          Used
                        </span>
                      ) : expired ? (
                        <span className="text-xs bg-red-50 text-red-600 rounded-full px-2.5 py-1 font-medium">
                          Expired
                        </span>
                      ) : (
                        <span className="text-xs bg-yellow-50 text-yellow-700 rounded-full px-2.5 py-1 font-medium">
                          Pending
                        </span>
                      )}

                      {/* Copy link button — only for pending invites */}
                      {!used && !expired && (
                        <button
                          onClick={() => copyToClipboard(invite.token)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors"
                        >
                          {copiedToken === invite.token ? (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy link
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
