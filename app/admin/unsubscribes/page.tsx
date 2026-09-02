"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";

type UnsubscribeEntry = {
  id: string;
  recipient: string;
  channel: string;
  reason: string | null;
  createdAt: string;
};

function extractError(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { message?: string; error?: string } } };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? fallback;
}

function isEmail(recipient: string): boolean {
  return /@/.test(recipient);
}

export default function AdminUnsubscribesPage() {
  const [entries, setEntries] = useState<UnsubscribeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "email" | "whatsapp">("all");
  const [search, setSearch] = useState("");

  // Add form
  const [newRecipient, setNewRecipient] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // The browser auto-sends the httpOnly `admin_session` cookie set by
  // AdminPasswordGate, so we don't need to pass the password as a header.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiClient.get<{ entries: UnsubscribeEntry[] }>(
        "/api/notifications/admin/unsubscribes",
      );
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(extractError(err, "Failed to load unsubscribes."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newRecipient.trim() || adding) return;
    setAdding(true);
    setAddError("");
    try {
      await apiClient.post("/api/notifications/admin/unsubscribes", {
        recipient: newRecipient.trim(),
        reason: newReason.trim() || undefined,
      });
      setNewRecipient("");
      setNewReason("");
      trackAnalyticsEvent({
        name: "admin_unsubscribe_added",
        properties: {
          channel: isEmail(newRecipient) ? "email" : "whatsapp",
          recipient: newRecipient.trim(),
        },
      });
      await load();
    } catch (err) {
      setAddError(extractError(err, "Failed to add unsubscribe."));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string, recipient: string) {
    if (!confirm(`Remove unsubscribe for ${recipient}?`)) return;
    try {
      await apiClient.delete(`/api/notifications/admin/unsubscribes/${id}`);
      trackAnalyticsEvent({
        name: "admin_unsubscribe_removed",
        properties: { channel: isEmail(recipient) ? "email" : "whatsapp", recipient },
      });
      await load();
    } catch (err) {
      alert(extractError(err, "Failed to remove unsubscribe."));
    }
  }

  const filtered = entries.filter((e) => {
    if (filter === "email" && !isEmail(e.recipient)) return false;
    if (filter === "whatsapp" && isEmail(e.recipient)) return false;
    if (
      search.trim() &&
      !e.recipient.toLowerCase().includes(search.trim().toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Unsubscribes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Users who have opted out of all email and WhatsApp notifications.
            The chart-notification cron JOINs against this list, so contacts
            here will never have their tasks picked up.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Add unsubscribe entry
        </h2>
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div>
            <label
              htmlFor="new-recipient"
              className="block text-xs font-medium text-slate-700"
            >
              Email or mobile
            </label>
            <input
              id="new-recipient"
              type="text"
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
              placeholder="user@example.com or 919876543210"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              required
            />
          </div>
          <div>
            <label
              htmlFor="new-reason"
              className="block text-xs font-medium text-slate-700"
            >
              Reason (optional)
            </label>
            <input
              id="new-reason"
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="e.g. spam complaints"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={adding || !newRecipient.trim()}
              className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
        {addError && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {addError}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Filter:</span>
          {(["all", "email", "whatsapp"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient…"
            className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="basis-full text-xs text-slate-500">
          {filtered.length} of {entries.length} shown
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="text-sm">{error}</p>
          <p className="mt-2 text-xs">
            Re-unlock the admin gate from the lock button in the header, then refresh.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
            <p className="text-sm text-slate-500">Loading unsubscribes…</p>
          </div>
        </div>
      ) : !error && entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          No unsubscribes yet. Use the form above to add one.
        </div>
      ) : !error && filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          No entries match the current filter.
        </div>
      ) : !error ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/50">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Recipient
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Channel
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Reason
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Created
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => {
                  const channel = isEmail(entry.recipient)
                    ? "email"
                    : "whatsapp";
                  return (
                    <tr
                      key={entry.id}
                      className="transition hover:bg-slate-50/50"
                    >
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-900">
                        {entry.recipient}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${
                            channel === "email"
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {channel}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {entry.reason || (
                          <span className="italic text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-600">
                        {new Date(entry.createdAt).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleRemove(entry.id, entry.recipient)}
                          className="rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
