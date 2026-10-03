"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Train,
  Upload,
  X,
} from "lucide-react";
import { apiClient } from "@/lib/api";

interface Passenger {
  name: string;
  age: number;
  gender: string;
  berthPreference?: string;
  seniorCitizen?: boolean;
}

interface SplitLeg {
  from: string;
  to: string;
  travelClass: string;
  fare: number;
  boardingDate: string;
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
}

export interface SplitBookingAdminEntry {
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
  serviceFee: number;
  legsPayload: SplitLeg[];
  passengers: {
    adults: Passenger[];
    children?: Array<{ name: string; age: number; gender: string }>;
  };
  contactMobile: string;
  contactEmail: string;
  autoUpgrade: boolean;
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  payUrl: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  bookingMode: "AI" | "MANUAL";
  bookingStatus:
    | "IDLE"
    | "QUEUED"
    | "IN_PROGRESS"
    | "MANUAL_PENDING"
    | "CONFIRMED"
    | "FAILED";
  manualEmailSentAt: string | null;
  manualWhatsappSentAt: string | null;
  customerEmailSentAt: string | null;
  customerWhatsappSentAt: string | null;
  pnrs: string[];
  pnrLeg1: string | null;
  pnrLeg2: string | null;
  ticketPdfFilename: string | null;
  ticketPdfContentType: string | null;
  ticketPdfUploadedAt: string | null;
  hasTicketPdf: boolean;
  bookingError: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PW_STORAGE_KEY = "irctc_keeper_admin_password";

const BOOKING_STATUS_STYLES: Record<
  SplitBookingAdminEntry["bookingStatus"],
  { badge: string; label: string }
> = {
  IDLE: { badge: "border-slate-200 bg-slate-100 text-slate-700", label: "Idle" },
  QUEUED: { badge: "border-blue-200 bg-blue-50 text-blue-700", label: "Queued" },
  IN_PROGRESS: {
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    label: "In Progress",
  },
  MANUAL_PENDING: {
    badge: "border-amber-300 bg-amber-50 text-amber-800 font-semibold",
    label: "Awaiting Manual",
  },
  CONFIRMED: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold",
    label: "Confirmed",
  },
  FAILED: {
    badge: "border-rose-200 bg-rose-50 text-rose-700 font-semibold",
    label: "Failed",
  },
};

const PAYMENT_STATUS_STYLES: Record<
  SplitBookingAdminEntry["paymentStatus"],
  { badge: string; label: string }
> = {
  PENDING: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    label: "Pending",
  },
  PAID: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold",
    label: "Paid",
  },
  FAILED: {
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    label: "Failed",
  },
};

function extractError(err: unknown, fallback: string): string {
  const ax = err as {
    response?: { data?: { message?: string; error?: string } };
  };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? fallback;
}

export default function SplitBookingsAdminPage() {
  const [entries, setEntries] = useState<SplitBookingAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Edit Modal State
  const [editingBooking, setEditingBooking] =
    useState<SplitBookingAdminEntry | null>(null);
  const [editBookingStatus, setEditBookingStatus] = useState<
    SplitBookingAdminEntry["bookingStatus"]
  >("MANUAL_PENDING");
  const [editPaymentStatus, setEditPaymentStatus] = useState<
    SplitBookingAdminEntry["paymentStatus"]
  >("PAID");
  const [editPaymentId, setEditPaymentId] = useState("");
  const [editPnr1, setEditPnr1] = useState("");
  const [editPnr2, setEditPnr2] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // PDF Upload Modal State
  const [pdfUploadBooking, setPdfUploadBooking] =
    useState<SplitBookingAdminEntry | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // Notify Modal State
  const [notifyBooking, setNotifyBooking] =
    useState<SplitBookingAdminEntry | null>(null);
  const [notifyChannel, setNotifyChannel] = useState<
    "both" | "email" | "whatsapp"
  >("both");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [sendingNotify, setSendingNotify] = useState(false);
  const [notifyFeedback, setNotifyFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setPassword(window.localStorage.getItem(PW_STORAGE_KEY) ?? "");
  }, []);

  const authHeaders = useCallback(
    () => (password ? { "x-admin-password": password } : {}),
    [password],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiClient.get<{
        entries: SplitBookingAdminEntry[];
      }>("/api/split-booking/admin", { headers: authHeaders() });
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(extractError(err, "Failed to load split ticket bookings."));
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedRef(text);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "PAID" || statusFilter === "PENDING_PAY") {
          if (statusFilter === "PAID" && entry.paymentStatus !== "PAID") {
            return false;
          }
          if (
            statusFilter === "PENDING_PAY" &&
            entry.paymentStatus !== "PENDING"
          ) {
            return false;
          }
        } else if (entry.bookingStatus !== statusFilter) {
          return false;
        }
      }

      // Search term filter
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const refMatch = entry.bookingRef.toLowerCase().includes(q);
      const trainMatch =
        entry.trainNumber.toLowerCase().includes(q) ||
        (entry.trainName?.toLowerCase().includes(q) ?? false);
      const phoneMatch = entry.contactMobile.includes(q);
      const emailMatch = entry.contactEmail.toLowerCase().includes(q);
      const passengerMatch =
        entry.passengers?.adults?.some((p) =>
          p.name.toLowerCase().includes(q),
        ) ?? false;
      const pnrMatch =
        entry.pnrs?.some((p) => p.includes(q)) ||
        (entry.pnrLeg1?.includes(q) ?? false) ||
        (entry.pnrLeg2?.includes(q) ?? false);

      return (
        refMatch ||
        trainMatch ||
        phoneMatch ||
        emailMatch ||
        passengerMatch ||
        pnrMatch
      );
    });
  }, [entries, search, statusFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const total = entries.length;
    const manualPending = entries.filter(
      (e) => e.bookingStatus === "MANUAL_PENDING",
    ).length;
    const confirmed = entries.filter(
      (e) => e.bookingStatus === "CONFIRMED",
    ).length;
    const paid = entries.filter((e) => e.paymentStatus === "PAID").length;
    const totalRevenue = entries
      .filter((e) => e.paymentStatus === "PAID")
      .reduce((sum, e) => sum + (e.totalFare + e.serviceFee), 0);

    return { total, manualPending, confirmed, paid, totalRevenue };
  }, [entries]);

  // Open Edit Modal
  const openEditModal = (b: SplitBookingAdminEntry) => {
    setEditingBooking(b);
    setEditBookingStatus(b.bookingStatus);
    setEditPaymentStatus(b.paymentStatus);
    setEditPaymentId(b.razorpayPaymentId || "");
    setEditPnr1(b.pnrLeg1 || b.pnrs?.[0] || "");
    setEditPnr2(b.pnrLeg2 || b.pnrs?.[1] || "");
    setEditError(b.bookingError || "");
  };

  // Submit Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;
    setSavingEdit(true);
    try {
      await apiClient.patch(
        `/api/split-booking/admin/${editingBooking.id}`,
        {
          bookingStatus: editBookingStatus,
          paymentStatus: editPaymentStatus,
          razorpayPaymentId: editPaymentId,
          pnrLeg1: editPnr1.trim(),
          pnrLeg2: editPnr2.trim(),
          pnrs: [editPnr1.trim(), editPnr2.trim()].filter(Boolean),
          bookingError: editError.trim() || null,
        },
        { headers: authHeaders() },
      );
      setEditingBooking(null);
      await load();
    } catch (err) {
      alert(extractError(err, "Failed to update booking."));
    } finally {
      setSavingEdit(false);
    }
  };

  // Upload PDF Handler
  const handleUploadPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfUploadBooking || !selectedFile) return;
    setUploadingPdf(true);
    setPdfError("");
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(selectedFile);
      const base64Data = await base64Promise;

      await apiClient.post(
        `/api/split-booking/admin/${pdfUploadBooking.id}/ticket-pdf`,
        {
          base64: base64Data,
          filename: selectedFile.name,
          contentType: selectedFile.type || "application/pdf",
        },
        { headers: authHeaders() },
      );

      setPdfUploadBooking(null);
      setSelectedFile(null);
      await load();
    } catch (err) {
      setPdfError(extractError(err, "Failed to upload ticket PDF."));
    } finally {
      setUploadingPdf(false);
    }
  };

  // Notify Customer Handler
  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyBooking) return;
    setSendingNotify(true);
    setNotifyFeedback(null);
    try {
      const res = await apiClient.post<{
        ok: boolean;
        emailSent: boolean;
        whatsappSent: boolean;
      }>(
        `/api/split-booking/admin/${notifyBooking.id}/notify-user`,
        {
          channel: notifyChannel,
          message: notifyMessage.trim() || undefined,
        },
        { headers: authHeaders() },
      );

      const parts = [];
      if (res.data.emailSent) parts.push("Email sent");
      if (res.data.whatsappSent) parts.push("WhatsApp sent");
      if (!res.data.emailSent && (notifyChannel === "email" || notifyChannel === "both")) {
        parts.push("Email failed or unconfigured");
      }
      if (!res.data.whatsappSent && (notifyChannel === "whatsapp" || notifyChannel === "both")) {
        parts.push("WhatsApp failed or unconfigured");
      }

      setNotifyFeedback({
        type: res.data.emailSent || res.data.whatsappSent ? "success" : "error",
        message: parts.join("; "),
      });
      await load();
    } catch (err) {
      setNotifyFeedback({
        type: "error",
        message: extractError(err, "Failed to trigger user notification."),
      });
    } finally {
      setSendingNotify(false);
    }
  };

  const pdfUrl = (ref: string) => {
    const base = apiClient.defaults.baseURL || "";
    return `${base}/api/split-booking/ticket-pdf/${encodeURIComponent(ref)}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Train className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Split Ticket Bookings
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Fulfill manual split reservations, manage PNRs, attach PDFs, and notify passengers.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500">
            Total Requests
          </span>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {metrics.total}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs">
          <span className="text-xs font-medium text-amber-800">
            Awaiting Manual
          </span>
          <p className="mt-1 text-2xl font-bold text-amber-900">
            {metrics.manualPending}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-xs">
          <span className="text-xs font-medium text-emerald-800">Confirmed</span>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {metrics.confirmed}
          </p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-xs">
          <span className="text-xs font-medium text-blue-800">
            Payments Received
          </span>
          <p className="mt-1 text-2xl font-bold text-blue-900">{metrics.paid}</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500">
            Total Collected
          </span>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            ₹{metrics.totalRevenue.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Booking Ref, Train, Passenger, Phone, Email, PNR…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="all">All Statuses</option>
            <option value="MANUAL_PENDING">Awaiting Manual</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="QUEUED">Queued</option>
            <option value="FAILED">Failed</option>
            <option value="PAID">Paid Only</option>
            <option value="PENDING_PAY">Pending Payment</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading && entries.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
            Loading booking requests…
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-rose-500" />
            <p className="text-sm font-semibold text-rose-700">{error}</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No booking requests match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Booking Ref</th>
                  <th className="px-4 py-3">Train & Date</th>
                  <th className="px-4 py-3">Route & Fare</th>
                  <th className="px-4 py-3">Passenger & Contact</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Fulfillment</th>
                  <th className="px-4 py-3">PNRs & PDF</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((b) => {
                  const statusConf =
                    BOOKING_STATUS_STYLES[b.bookingStatus] || {
                      badge: "bg-slate-100 text-slate-700",
                      label: b.bookingStatus,
                    };
                  const paymentConf =
                    PAYMENT_STATUS_STYLES[b.paymentStatus] || {
                      badge: "bg-slate-100 text-slate-700",
                      label: b.paymentStatus,
                    };
                  const hasPnrs =
                    (b.pnrs && b.pnrs.length > 0) || Boolean(b.pnrLeg1);

                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Booking Ref */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">
                            {b.bookingRef}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(b.bookingRef)}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                            title="Copy Ref"
                          >
                            {copiedRef === b.bookingRef ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                        <span className="block mt-0.5 text-[11px] text-slate-400">
                          {new Date(b.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {b.autoUpgrade && (
                          <span className="inline-block mt-1 rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
                            Auto-Upgrade
                          </span>
                        )}
                      </td>

                      {/* Train & Date */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-bold text-slate-900">
                          {b.trainNumber}{" "}
                          <span className="font-normal text-slate-500">
                            {b.trainName || ""}
                          </span>
                        </div>
                        <div className="mt-0.5 font-medium text-slate-600">
                          {b.journeyDate}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          Class: <strong>{b.travelClass}</strong> · Quota:{" "}
                          <strong>{b.quota}</strong>
                        </div>
                      </td>

                      {/* Route & Fare */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-1 font-bold text-slate-800">
                          <span>{b.fromStationCode}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span>{b.toStationCode}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {b.legsPayload?.map((leg, lIdx) => (
                            <span
                              key={lIdx}
                              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 tabular-nums"
                            >
                              L{lIdx + 1}: {leg.from}→{leg.to} (₹{leg.fare})
                            </span>
                          ))}
                        </div>
                        <div className="mt-1 text-slate-900 font-bold tabular-nums">
                          ₹{b.totalFare + b.serviceFee}{" "}
                          <span className="text-[10px] font-normal text-slate-400">
                            (₹{b.totalFare} + ₹{b.serviceFee} fee)
                          </span>
                        </div>
                      </td>

                      {/* Passenger & Contact */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-0.5">
                          {b.passengers?.adults?.map((p, pIdx) => (
                            <div key={pIdx} className="font-medium text-slate-800">
                              {p.name}{" "}
                              <span className="text-slate-400 text-[11px]">
                                ({p.gender[0]}, {p.age}y)
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-1.5 space-y-0.5 text-[11px]">
                          <div>
                            <a
                              href={`https://wa.me/91${b.contactMobile.replace(/\D/g, "").slice(-10)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-emerald-700 hover:underline inline-flex items-center gap-1"
                            >
                              <MessageSquare className="h-3 w-3" />
                              {b.contactMobile}
                            </a>
                          </div>
                          <div>
                            <a
                              href={`mailto:${b.contactEmail}`}
                              className="text-blue-600 hover:underline inline-flex items-center gap-1 truncate max-w-[160px]"
                            >
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{b.contactEmail}</span>
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-3.5 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${paymentConf.badge}`}
                        >
                          {paymentConf.label}
                        </span>
                        {b.razorpayPaymentId && (
                          <span className="block mt-1 font-mono text-[10px] text-slate-500 truncate max-w-[110px]">
                            {b.razorpayPaymentId}
                          </span>
                        )}
                        {b.paidAt && (
                          <span className="block mt-0.5 text-[10px] text-slate-400">
                            {new Date(b.paidAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </td>

                      {/* Booking Status */}
                      <td className="px-4 py-3.5 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusConf.badge}`}
                        >
                          {statusConf.label}
                        </span>
                        {b.bookingError && (
                          <span
                            className="block mt-1 text-[10px] text-rose-600 max-w-[140px] truncate"
                            title={b.bookingError}
                          >
                            {b.bookingError}
                          </span>
                        )}
                      </td>

                      {/* PNRs & Ticket PDF */}
                      <td className="px-4 py-3.5 align-top">
                        {hasPnrs ? (
                          <div className="space-y-0.5 font-mono text-[11px] font-bold text-slate-900">
                            {b.pnrLeg1 && <div>L1: {b.pnrLeg1}</div>}
                            {b.pnrLeg2 && <div>L2: {b.pnrLeg2}</div>}
                            {!b.pnrLeg1 &&
                              !b.pnrLeg2 &&
                              b.pnrs?.map((p, idx) => (
                                <div key={idx}>
                                  L{idx + 1}: {p}
                                </div>
                              ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            No PNRs yet
                          </span>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {b.hasTicketPdf ? (
                            <a
                              href={pdfUrl(b.bookingRef)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                            >
                              <FileText className="h-3 w-3" />
                              PDF
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPdfUploadBooking(b);
                                setSelectedFile(null);
                                setPdfError("");
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                            >
                              <Upload className="h-3 w-3" />
                              Add PDF
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(b)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3 text-slate-500" />
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setNotifyBooking(b);
                              setNotifyChannel("both");
                              setNotifyMessage("");
                              setNotifyFeedback(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                          >
                            <Mail className="h-3 w-3" />
                            Notify
                          </button>

                          {(b.customerEmailSentAt ||
                            b.customerWhatsappSentAt) && (
                            <span className="text-[10px] text-slate-400">
                              Notified ✓
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- 1. Edit Booking & PNRs Modal --- */}
      {editingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Booking & PNRs
                </h3>
                <p className="text-xs text-slate-500">
                  {editingBooking.bookingRef} · Train {editingBooking.trainNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBooking(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Booking Status
                  </label>
                  <select
                    value={editBookingStatus}
                    onChange={(e) =>
                      setEditBookingStatus(
                        e.target.value as SplitBookingAdminEntry["bookingStatus"],
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
                  >
                    <option value="MANUAL_PENDING">Awaiting Manual</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="QUEUED">Queued</option>
                    <option value="FAILED">Failed</option>
                    <option value="IDLE">Idle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    value={editPaymentStatus}
                    onChange={(e) =>
                      setEditPaymentStatus(
                        e.target.value as SplitBookingAdminEntry["paymentStatus"],
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
                  >
                    <option value="PAID">Paid</option>
                    <option value="PENDING">Pending</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Transaction ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. pay_XXXXX or UPI reference"
                  value={editPaymentId}
                  onChange={(e) => setEditPaymentId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Leg 1 PNR (10 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. 2345678901"
                    value={editPnr1}
                    onChange={(e) => setEditPnr1(e.target.value)}
                    className="w-full font-mono rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
                  />
                  <span className="block mt-0.5 text-[10px] text-slate-400">
                    {editingBooking.legsPayload?.[0]?.from} →{" "}
                    {editingBooking.legsPayload?.[0]?.to}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Leg 2 PNR (10 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. 6543210987"
                    value={editPnr2}
                    onChange={(e) => setEditPnr2(e.target.value)}
                    className="w-full font-mono rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
                  />
                  <span className="block mt-0.5 text-[10px] text-slate-400">
                    {editingBooking.legsPayload?.[1]?.from} →{" "}
                    {editingBooking.legsPayload?.[1]?.to}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Booking Error / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Visible to user if failed"
                  value={editError}
                  onChange={(e) => setEditError(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBooking(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- 2. Upload Ticket PDF Modal --- */}
      {pdfUploadBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Upload Ticket PDF
                </h3>
                <p className="text-xs text-slate-500">
                  {pdfUploadBooking.bookingRef} · {pdfUploadBooking.contactEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPdfUploadBooking(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUploadPdf} className="mt-4 space-y-4">
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center hover:bg-slate-100/60 transition">
                <FileText className="mx-auto h-8 w-8 text-slate-400" />
                <label className="mt-2 block cursor-pointer">
                  <span className="text-xs font-semibold text-blue-600 hover:underline">
                    Choose a PDF file
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) =>
                      setSelectedFile(e.target.files?.[0] || null)
                    }
                    className="sr-only"
                  />
                </label>
                <p className="mt-1 text-[11px] text-slate-400">
                  IRCTC e-ticket PDF up to 15MB
                </p>
                {selectedFile && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                  </div>
                )}
              </div>

              {pdfError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                  {pdfError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPdfUploadBooking(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || uploadingPdf}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-50"
                >
                  {uploadingPdf ? "Uploading…" : "Upload PDF"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- 3. Notify Customer Modal --- */}
      {notifyBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Notify Passenger
                </h3>
                <p className="text-xs text-slate-500">
                  Send confirmed ticket confirmation & PNRs to customer
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotifyBooking(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendNotification} className="mt-4 space-y-4">
              {/* Recipient summary */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-semibold text-slate-900">
                    {notifyBooking.contactEmail}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">WhatsApp:</span>
                  <span className="font-semibold text-slate-900">
                    {notifyBooking.contactMobile}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Train & Date:</span>
                  <span className="font-semibold text-slate-900">
                    {notifyBooking.trainNumber} on {notifyBooking.journeyDate}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">PNRs Attached:</span>
                  <span className="font-mono font-semibold text-emerald-800">
                    {notifyBooking.pnrs?.join(", ") ||
                      [notifyBooking.pnrLeg1, notifyBooking.pnrLeg2]
                        .filter(Boolean)
                        .join(", ") ||
                      "None (pending)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ticket PDF Link:</span>
                  <span
                    className={
                      notifyBooking.hasTicketPdf
                        ? "text-emerald-700 font-semibold"
                        : "text-slate-400"
                    }
                  >
                    {notifyBooking.hasTicketPdf
                      ? "Yes, PDF link included"
                      : "No PDF uploaded yet"}
                  </span>
                </div>
              </div>

              {/* Channel Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Notification Channel
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifyChannel("both")}
                    className={`rounded-xl border p-2 text-xs font-semibold text-center transition cursor-pointer ${
                      notifyChannel === "both"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Email & WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyChannel("email")}
                    className={`rounded-xl border p-2 text-xs font-semibold text-center transition cursor-pointer ${
                      notifyChannel === "email"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Email Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyChannel("whatsapp")}
                    className={`rounded-xl border p-2 text-xs font-semibold text-center transition cursor-pointer ${
                      notifyChannel === "whatsapp"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    WhatsApp Only
                  </button>
                </div>
              </div>

              {/* Custom message */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Operator Note (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Berths assigned: S3-21 and S5-44. Enjoy your journey!"
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              {notifyFeedback && (
                <div
                  className={`rounded-xl p-3 text-xs font-semibold ${
                    notifyFeedback.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}
                >
                  {notifyFeedback.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNotifyBooking(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={sendingNotify}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-50"
                >
                  {sendingNotify ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="h-3 w-3" />
                      Send Notification
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
