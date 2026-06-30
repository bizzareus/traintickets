"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

type KeeperStatus = {
  enabled: boolean;
  refreshing: boolean;
  lastRefreshAt: string | null;
  lastError: string | null;
  cookieFile: string;
  cookie:
    | { present: true; length: number; updatedAt: string; source?: string; sessionId?: string }
    | { present: false };
};

function extractError(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { message?: string; error?: string } } };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? fallback;
}

export default function IrctcCookiesAdminPage() {
  const [status, setStatus] = useState<KeeperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"refresh" | "manual" | null>(null);
  const [notice, setNotice] = useState("");
  const [cookie, setCookie] = useState("");

  const loadStatus = useCallback(async () => {
    setError("");
    try {
      const { data } = await apiClient.get<KeeperStatus>("/api/admin/irctc-keeper");
      setStatus(data);
    } catch (err) {
      setError(extractError(err, "Failed to load keeper status."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function onRefresh() {
    setBusy("refresh");
    setNotice("");
    setError("");
    try {
      const { data } = await apiClient.post<{ ok: boolean; error?: string }>(
        "/api/admin/irctc-keeper/refresh",
        {},
      );
      setNotice(
        data.ok
          ? "Harvest succeeded — cookies refreshed."
          : `Harvest did not succeed: ${data.error ?? "unknown error"}`,
      );
    } catch (err) {
      setError(extractError(err, "Refresh request failed."));
    } finally {
      setBusy(null);
      void loadStatus();
    }
  }

  async function onManualSet() {
    setBusy("manual");
    setNotice("");
    setError("");
    try {
      const { data } = await apiClient.post<{ ok: boolean; error?: string; length?: number }>(
        "/api/admin/irctc-keeper/cookie",
        { cookie },
      );
      if (data.ok) {
        setNotice(`Saved manual cookie (${data.length} chars).`);
        setCookie("");
      } else {
        setError(data.error ?? "Cookie rejected.");
      }
    } catch (err) {
      setError(extractError(err, "Failed to save cookie."));
    } finally {
      setBusy(null);
      void loadStatus();
    }
  }

  const c = status?.cookie;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">IRCTC cookies</h1>
      <p className="mt-1 text-slate-600">
        The session keeper harvests the IRCTC cookie bundle via a browser-use cloud browser and
        stores it for the backend to use. View its status, force a refresh, or paste in a cookie
        captured from a working browser session yourself.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {/* Status */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Current status</h2>
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="text-sm text-blue-600 hover:underline"
          >
            Reload
          </button>
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : status ? (
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Keeper enabled" value={status.enabled ? "yes" : "no"} />
            <Row label="Refreshing now" value={status.refreshing ? "yes" : "no"} />
            <Row label="Last refresh" value={status.lastRefreshAt ?? "never"} />
            <Row
              label="Last error"
              value={status.lastError ?? "none"}
              danger={Boolean(status.lastError)}
            />
            <Row label="Cookie present" value={c?.present ? "yes" : "no"} danger={!c?.present} />
            {c?.present && <Row label="Cookie length" value={`${c.length} chars`} />}
            {c?.present && <Row label="Cookie source" value={c.source ?? "n/a"} />}
            {c?.present && <Row label="Cookie updated" value={c.updatedAt} />}
            <Row label="Cookie file" value={status.cookieFile} />
          </dl>
        ) : null}

        <button
          type="button"
          onClick={onRefresh}
          disabled={busy !== null}
          className="mt-5 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy === "refresh" ? "Refreshing…" : "Refresh now (browser-use harvest)"}
        </button>
      </div>

      {/* Manual cookie */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-900">Set cookie manually</h2>
        <p className="mt-1 text-sm text-slate-600">
          Paste the full <code className="rounded bg-slate-100 px-0.5">Cookie:</code> header from a
          working IRCTC <code className="rounded bg-slate-100 px-0.5">online-charts</code> request
          (DevTools → Network → copy the Cookie request header). This overrides whatever the keeper
          last stored, until the next automated refresh overwrites it.
        </p>
        <textarea
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder="_pubcid=…; PIM-SESSION-ID=…; et_appVIP1=…; bm_sz=…; _abck=…"
          className="mt-3 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
        />
        <button
          type="button"
          onClick={onManualSet}
          disabled={busy !== null || cookie.trim().length === 0}
          className="mt-3 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy === "manual" ? "Saving…" : "Save cookie"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`break-all font-medium ${danger ? "text-red-700" : "text-slate-900"}`}>
        {value}
      </dd>
    </div>
  );
}
