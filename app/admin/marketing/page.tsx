"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Mail,
  Play,
  RefreshCw,
  Search,
  Send,
  Settings,
  X,
} from "lucide-react";
import { apiClient } from "@/lib/api";

const PW_STORAGE_KEYS = [
  "irctc_keeper_admin_password",
  "admin_password",
  "chart_time_ingestion_password",
];

interface MarketingStats {
  totalAbandoned: number;
  remindersSent: number;
  recoveredBookings: number;
  recoveryRatePercent: number;
  recoveredRevenue: number;
  lastCronRun: {
    startedAt: string | null;
    status: string | null;
    durationMs: number | null;
    emailsSent: number;
  } | null;
}

interface MarketingConfig {
  id: string;
  enabled: boolean;
  minAbandonedMinutes: number;
  maxLookbackHours: number;
  updatedAt: string;
}

interface AbandonedBookingItem {
  id: string;
  bookingRef: string;
  trainNumber: string;
  trainName: string | null;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  travelClass: string;
  quota: string;
  totalFare: number;
  passengerName: string;
  passengerAge?: number;
  passengerGender?: string;
  contactMobile: string;
  contactEmail: string;
  paymentStatus: string;
  bookingStatus: string;
  createdAt: string;
  abandonedReminderSentAt: string | null;
  status: "pending_reminder" | "reminder_sent" | "recovered" | "cancelled";
  payUrl: string | null;
}

interface AbandonedBookingsResponse {
  items: AbandonedBookingItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function getStoredAdminPassword(): string {
  if (typeof window === "undefined") return "";
  for (const k of PW_STORAGE_KEYS) {
    const val = window.localStorage.getItem(k);
    if (val) return val;
  }
  return "";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminMarketingPage() {
  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [config, setConfig] = useState<MarketingConfig | null>(null);
  const [bookings, setBookings] = useState<AbandonedBookingItem[]>([]);
  const [totalBookings, setTotalBookings] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending_reminder" | "reminder_sent" | "recovered"
  >("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Sidebar settings state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsEnabled, setSettingsEnabled] = useState(true);
  const [settingsMinMinutes, setSettingsMinMinutes] = useState(15);
  const [settingsMaxHours, setSettingsMaxHours] = useState(48);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  // Run Now state
  const [runningCron, setRunningCron] = useState(false);
  const [cronFeedback, setCronFeedback] = useState<string | null>(null);

  // Manual send state
  const [sendingRef, setSendingRef] = useState<string | null>(null);
  const [manualSendFeedback, setManualSendFeedback] = useState<string | null>(null);

  // Test email modal state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmailInput, setTestEmailInput] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const getHeaders = useCallback(() => {
    const pw = getStoredAdminPassword();
    return pw ? { "x-admin-password": pw } : {};
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = getHeaders();
      const [statsRes, configRes, bookingsRes] = await Promise.all([
        apiClient.get<MarketingStats>("/api/admin/marketing/stats", { headers }),
        apiClient.get<MarketingConfig>("/api/admin/marketing/config", { headers }),
        apiClient.get<AbandonedBookingsResponse>(
          "/api/admin/marketing/abandoned-bookings",
          {
            headers,
            params: {
              page,
              limit: 15,
              status: statusFilter,
              search: search.trim() || undefined,
            },
          },
        ),
      ]);

      setStats(statsRes.data);
      setConfig(configRes.data);
      setSettingsEnabled(configRes.data.enabled);
      setSettingsMinMinutes(configRes.data.minAbandonedMinutes);
      setSettingsMaxHours(configRes.data.maxLookbackHours);

      setBookings(bookingsRes.data.items || []);
      setTotalBookings(bookingsRes.data.total || 0);
      setTotalPages(bookingsRes.data.totalPages || 1);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      setError(msg || "Failed to load marketing engine data. Please check admin authorization.");
    } finally {
      setLoading(false);
    }
  }, [getHeaders, page, statusFilter, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage("");
    try {
      const res = await apiClient.put<MarketingConfig>(
        "/api/admin/marketing/config",
        {
          enabled: settingsEnabled,
          minAbandonedMinutes: Number(settingsMinMinutes),
          maxLookbackHours: Number(settingsMaxHours),
        },
        { headers: getHeaders() },
      );
      setConfig(res.data);
      setSettingsMessage("Marketing settings saved successfully!");
      setTimeout(() => setSettingsMessage(""), 4000);
    } catch {
      alert("Failed to update marketing settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRunCronNow = async () => {
    if (
      !window.confirm(
        "Trigger the 15-minute Marketing Engine cron immediately? This will email eligible abandoned booking users.",
      )
    ) {
      return;
    }

    setRunningCron(true);
    setCronFeedback(null);
    try {
      const res = await apiClient.post<{
        scanned: number;
        eligible: number;
        sent: number;
        skipped: number;
        errors: string[];
      }>("/api/admin/marketing/run-now", {}, { headers: getHeaders() });
      const data = res.data;
      setCronFeedback(
        `Cron finished: ${data.sent} sent, ${data.skipped} skipped, ${data.scanned} scanned.`,
      );
      await loadData();
    } catch {
      setCronFeedback("Cron execution failed. Inspect logs for details.");
    } finally {
      setRunningCron(false);
    }
  };

  const handleSendManualReminder = async (bookingRef: string) => {
    if (!window.confirm(`Send recovery reminder email immediately for ${bookingRef}?`)) return;

    setSendingRef(bookingRef);
    setManualSendFeedback(null);
    try {
      await apiClient.post(
        `/api/admin/marketing/send-reminder/${encodeURIComponent(bookingRef)}`,
        {},
        { headers: getHeaders() },
      );
      setManualSendFeedback(`Reminder sent successfully for ${bookingRef}`);
      await loadData();
    } catch {
      alert(`Failed to send reminder for ${bookingRef}`);
    } finally {
      setSendingRef(null);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailInput.trim()) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      await apiClient.post(
        "/api/admin/marketing/send-test-email",
        { email: testEmailInput.trim() },
        { headers: getHeaders() },
      );
      setTestResult(`Test email delivered to ${testEmailInput}! Check inbox.`);
    } catch {
      setTestResult("Failed to send test email. Verify Resend credentials.");
    } finally {
      setSendingTest(false);
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedRef(text);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header and Status */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900">Marketing Engine</h1>
            {config?.enabled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Active (15m Cron)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                Paused
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Reaches out once to passengers with abandoned booking checkouts, providing a 1-click resume link with details pre-filled.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={runningCron}
            onClick={handleRunCronNow}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
          >
            {runningCron ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Running Cron…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" /> Run Cron Now
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
            title="Marketing Engine Configuration"
          >
            <Settings className="h-3.5 w-3.5 text-slate-600" /> Settings
          </button>
          <button
            type="button"
            onClick={() => {
              setShowTestModal(true);
              setTestResult(null);
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <Mail className="h-3.5 w-3.5 text-blue-600" /> Send Test Email
          </button>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white p-2.5 text-slate-600 shadow-xs hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {cronFeedback && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/90 p-3.5 text-sm font-semibold text-indigo-900">
          <span>{cronFeedback}</span>
          <button
            type="button"
            onClick={() => setCronFeedback(null)}
            className="text-indigo-600 hover:text-indigo-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {manualSendFeedback && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-sm font-semibold text-emerald-900">
          <span>{manualSendFeedback}</span>
          <button
            type="button"
            onClick={() => setManualSendFeedback(null)}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Abandoned
            </span>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {stats?.totalAbandoned.toLocaleString("en-IN") ?? "0"}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Unpaid / Failed checkouts</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Reminders Sent
            </span>
            <Send className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-600">
            {stats?.remindersSent.toLocaleString("en-IN") ?? "0"}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">1 email per customer</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Recovered
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600">
            {stats?.recoveredBookings.toLocaleString("en-IN") ?? "0"}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Paid after reminder</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Recovery Rate
            </span>
            <Flame className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {stats?.recoveryRatePercent ?? 0}%
          </div>
          <p className="mt-1 text-[11px] font-semibold text-emerald-600">
            ₹{(stats?.recoveredRevenue ?? 0).toLocaleString("en-IN")} recovered
          </p>
        </div>

        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Last Cron Run
            </span>
            <Activity className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-sm font-bold text-slate-800">
            {formatDate(stats?.lastCronRun?.startedAt)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Status:{" "}
            <span className="font-semibold text-slate-700">
              {stats?.lastCronRun?.status || "Idle"}
            </span>
            {stats?.lastCronRun?.emailsSent != null
              ? ` (${stats.lastCronRun.emailsSent} sent)`
              : ""}
          </p>
        </div>
      </div>

      {/* Abandoned Bookings Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === "all"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({totalBookings})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("pending_reminder");
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === "pending_reminder"
                  ? "bg-amber-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Pending Reminder
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("reminder_sent");
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === "reminder_sent"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Reminder Sent
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("recovered");
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === "recovered"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Recovered (Paid)
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search ref, train, email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 sm:w-60"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Booking Ref</th>
                <th className="px-4 py-3">Train & Route</th>
                <th className="px-4 py-3">Journey Date</th>
                <th className="px-4 py-3">Passenger & Contact</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Fare</th>
                <th className="px-4 py-3">Initiated</th>
                <th className="px-4 py-3">Reminder Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
                    No abandoned bookings match your filter criteria.
                  </td>
                </tr>
              ) : (
                bookings.map((b) => {
                  const resumeUrl = `/split-booking/resume?ref=${encodeURIComponent(b.bookingRef)}`;
                  const canSendReminder =
                    (b.paymentStatus === "PENDING" || b.paymentStatus === "FAILED") &&
                    b.bookingStatus !== "CANCELLED" &&
                    b.bookingStatus !== "CONFIRMED";

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{b.bookingRef}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(b.bookingRef)}
                            className="text-slate-400 hover:text-slate-700"
                            title="Copy ref"
                          >
                            {copiedRef === b.bookingRef ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {b.trainNumber} {b.trainName ? `· ${b.trainName}` : ""}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {b.fromStationCode} &rarr; {b.toStationCode}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{b.journeyDate}</div>
                        <div className="text-[11px] text-slate-500">
                          Class: {b.travelClass} ({b.quota})
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {b.passengerName}
                          {b.passengerAge ? ` (${b.passengerAge}y)` : ""}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {b.contactEmail} &middot; {b.contactMobile}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {b.paymentStatus === "FAILED" ? (
                          <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                            FAILED
                          </span>
                        ) : b.paymentStatus === "PAID" ? (
                          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            PAID
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            PENDING
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-bold text-slate-900">
                        ₹{b.totalFare.toLocaleString("en-IN")}
                      </td>

                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(b.createdAt)}
                      </td>

                      <td className="px-4 py-3">
                        {b.status === "recovered" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Recovered (PAID)
                          </span>
                        ) : b.status === "reminder_sent" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                            <Send className="h-3 w-3" /> Sent ({formatDate(b.abandonedReminderSentAt)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            <Clock className="h-3 w-3" /> Pending Reminder
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canSendReminder && (
                            <button
                              type="button"
                              disabled={sendingRef === b.bookingRef}
                              onClick={() => handleSendManualReminder(b.bookingRef)}
                              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                              title="Send or resend recovery email now"
                            >
                              {sendingRef === b.bookingRef ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Send className="h-3 w-3 text-indigo-600" />
                              )}
                              Send Now
                            </button>
                          )}
                          <Link
                            href={resumeUrl}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50"
                            title="Open recovery resume page"
                          >
                            <ExternalLink className="h-3 w-3" /> Resume Page
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
            <div>
              Page <span className="font-bold text-slate-900">{page}</span> of{" "}
              <span className="font-bold text-slate-900">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-Over Settings Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-md border-l border-slate-200 bg-white shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-slate-700" />
                    <h2 className="text-base font-bold text-slate-900">
                      Marketing Engine Configuration
                    </h2>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Automated abandoned checkout recovery settings
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body / Form */}
              <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto p-6 space-y-5">
                {settingsMessage && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                    {settingsMessage}
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div>
                    <label htmlFor="drawer-engine-enabled" className="text-xs font-bold text-slate-900">
                      15-Minute Cron Engine
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Periodically scan and email abandoned / failed checkouts
                    </p>
                  </div>
                  <input
                    id="drawer-engine-enabled"
                    type="checkbox"
                    checked={settingsEnabled}
                    onChange={(e) => setSettingsEnabled(e.target.checked)}
                    className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <label htmlFor="drawer-min-minutes" className="block text-xs font-bold text-slate-900">
                    Min Abandoned Delay (Minutes)
                  </label>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Wait duration after checkout initiation before sending the recovery reminder.
                  </p>
                  <input
                    id="drawer-min-minutes"
                    type="number"
                    min="1"
                    max="1440"
                    value={settingsMinMinutes}
                    onChange={(e) => setSettingsMinMinutes(Number(e.target.value))}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <label htmlFor="drawer-max-hours" className="block text-xs font-bold text-slate-900">
                    Max Lookback Window (Hours)
                  </label>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Maximum checkout age to consider for recovery (e.g. 48 hours).
                  </p>
                  <input
                    id="drawer-max-hours"
                    type="number"
                    min="1"
                    max="168"
                    value={settingsMaxHours}
                    onChange={(e) => setSettingsMaxHours(Number(e.target.value))}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingSettings ? "Saving…" : "Save Settings"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Send Test Email Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Send Test Abandoned Cart Email
              </h3>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendTestEmail} className="mt-4 space-y-4">
              <p className="text-xs text-slate-600">
                Dispatches a preview recovery reminder email with realistic sample ticket data and a pre-filled resume CTA button.
              </p>
              <div>
                <label htmlFor="test-recipient-email" className="block text-xs font-bold text-slate-700">
                  Recipient Email
                </label>
                <input
                  id="test-recipient-email"
                  type="email"
                  required
                  placeholder="yourname@example.com"
                  value={testEmailInput}
                  onChange={(e) => setTestEmailInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {testResult && (
                <div
                  className={`rounded-xl p-3 text-xs font-semibold ${
                    testResult.includes("delivered")
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {testResult}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={sendingTest}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {sendingTest ? "Sending…" : "Send Test Now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
