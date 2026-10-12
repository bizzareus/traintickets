"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Train,
  Upload,
  X,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import type { SplitBookingPrice } from "@/lib/split-booking";
import { bookingPriceItems, formatBookingAmount } from "@/lib/bookingPrice";
import { BookingPriceBreakdown } from "@/components/booking-v2/BookingPriceBreakdown";

interface Passenger {
  name: string;
  age: number;
  gender: string;
  berthPreference?: string;
  optBerth?: boolean;
  foodChoice?: string;
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
  availability?: string | null;
}

export interface SplitBookingAdminEntry extends SplitBookingPrice {
  id: string;
  bookingRef: string;
  trainNumber: string;
  trainName: string | null;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  travelClass: string;
  quota: string;
  legsPayload: SplitLeg[];
  passengers: {
    adults: Passenger[];
    children?: Array<{ name: string; age: number; gender: string }>;
    confirmBerthsOnly?: boolean;
    preferredCoach?: string | null;
    travelInsurance?: boolean;
  };
  contactMobile: string;
  contactEmail: string;
  autoUpgrade: boolean;
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  muzoboxPaymentId?: string | null;
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
    | "CANCELLED"
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
  IDLE: {
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    label: "Idle",
  },
  QUEUED: {
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    label: "Queued",
  },
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
  CANCELLED: {
    badge: "border-purple-200 bg-purple-50 text-purple-700 font-semibold",
    label: "Cancelled & Refunded",
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

export interface CancellationAdminEntry {
  id: string;
  bookingId: string;
  bookingRef: string;
  mobile: string;
  reason: string | null;
  status: "PENDING" | "PROCESSED" | "REJECTED";
  adminNotes: string | null;
  adminEmailSentAt: string | null;
  adminWhatsappSentAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  booking:
    | (SplitBookingPrice & {
        id: string;
        bookingRef: string;
        trainNumber: string;
        trainName: string | null;
        fromStationCode: string;
        toStationCode: string;
        journeyDate: string;
        travelClass: string;
        contactMobile: string;
        contactEmail: string;
        bookingStatus: string;
        paymentStatus: string;
        pnrs: string[];
        pnrLeg1: string | null;
        pnrLeg2: string | null;
        passengers: {
          adults: Passenger[];
          children?: Array<{ name: string; age: number; gender: string }>;
        };
      })
    | null;
}

const CANCELLATION_STATUS_STYLES: Record<
  CancellationAdminEntry["status"],
  { badge: string; label: string }
> = {
  PENDING: {
    badge: "border-amber-300 bg-amber-50 text-amber-800 font-semibold",
    label: "Pending Review",
  },
  PROCESSED: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold",
    label: "Processed & Refunded",
  },
  REJECTED: {
    badge: "border-rose-200 bg-rose-50 text-rose-700 font-semibold",
    label: "Rejected",
  },
};

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25MB

function extractError(err: unknown, fallback: string): string {
  const ax = err as {
    response?: {
      status?: number;
      data?: { message?: string; error?: string };
    };
  };
  const msg = ax.response?.data?.message || "";
  const errStr = ax.response?.data?.error || "";
  if (
    ax.response?.status === 413 ||
    msg.toLowerCase().includes("too large") ||
    errStr.toLowerCase().includes("too large")
  ) {
    return "The uploaded PDF is too large (maximum size is 25MB). Please upload a smaller or compressed ticket PDF.";
  }
  return ax.response?.data?.message ?? ax.response?.data?.error ?? fallback;
}

function SplitBookingsAdminContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"bookings" | "cancellations">(
    tabParam === "cancellations" ? "cancellations" : "bookings",
  );

  const [entries, setEntries] = useState<SplitBookingAdminEntry[]>([]);
  const [cancellations, setCancellations] = useState<CancellationAdminEntry[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cancellationSearch, setCancellationSearch] = useState("");
  const [cancellationStatusFilter, setCancellationStatusFilter] =
    useState<string>("all");
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Ticket Details Modal State (on row click)
  const [selectedDetailsBooking, setSelectedDetailsBooking] =
    useState<SplitBookingAdminEntry | null>(null);
  const [copiedRawDetails, setCopiedRawDetails] = useState(false);

  // Edit Modal State
  const [editingBooking, setEditingBooking] =
    useState<SplitBookingAdminEntry | null>(null);
  const [editBookingStatus, setEditBookingStatus] =
    useState<SplitBookingAdminEntry["bookingStatus"]>("MANUAL_PENDING");
  const [editPaymentStatus, setEditPaymentStatus] =
    useState<SplitBookingAdminEntry["paymentStatus"]>("PAID");
  const [editPaymentId, setEditPaymentId] = useState("");
  const [editPnr1, setEditPnr1] = useState("");
  const [editPnr2, setEditPnr2] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Cancellation Action Modal State
  const [actionCancellation, setActionCancellation] =
    useState<CancellationAdminEntry | null>(null);
  const [actionStatus, setActionStatus] = useState<
    "PENDING" | "PROCESSED" | "REJECTED"
  >("PROCESSED");
  const [actionNotes, setActionNotes] = useState("");
  const [savingCancellation, setSavingCancellation] = useState(false);
  const [cancellationActionError, setCancellationActionError] = useState("");

  // Cancel & Refund Modal State
  const [refundBooking, setRefundBooking] =
    useState<SplitBookingAdminEntry | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [processingRefund, setProcessingRefund] = useState(false);
  const [refundModalError, setRefundModalError] = useState("");
  const [refundSuccessMsg, setRefundSuccessMsg] = useState("");

  // PDF Upload Modal State
  const [pdfUploadBooking, setPdfUploadBooking] =
    useState<SplitBookingAdminEntry | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // Notify Modal State
  const [notifyBooking, setNotifyBooking] =
    useState<SplitBookingAdminEntry | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyLegPnrs, setNotifyLegPnrs] = useState<string[]>([]);
  const [notifyPdfFile, setNotifyPdfFile] = useState<File | null>(null);
  const [notifyMissingWarning, setNotifyMissingWarning] = useState<
    string | null
  >(null);
  const [sendingNotify, setSendingNotify] = useState(false);
  const [notifyFeedback, setNotifyFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (tabParam === "cancellations") {
      setActiveTab("cancellations");
    } else if (tabParam === "bookings") {
      setActiveTab("bookings");
    }
  }, [tabParam]);

  const openNotifyModal = (b: SplitBookingAdminEntry) => {
    setNotifyBooking(b);
    setNotifyMessage("");
    setNotifyFeedback(null);
    setNotifyPdfFile(null);
    setNotifyMissingWarning(null);
    const initialPnrs = b.legsPayload.map((_, idx) => {
      if (b.pnrs && b.pnrs[idx]) return b.pnrs[idx];
      if (idx === 0 && b.pnrLeg1) return b.pnrLeg1;
      if (idx === 1 && b.pnrLeg2) return b.pnrLeg2;
      return "";
    });
    setNotifyLegPnrs(initialPnrs);
  };

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
      const [bookingsRes, cancellationsRes] = await Promise.allSettled([
        apiClient.get<{
          entries: SplitBookingAdminEntry[];
        }>("/api/split-booking/admin", { headers: authHeaders() }),
        apiClient.get<CancellationAdminEntry[]>(
          "/api/split-booking/admin/cancellations",
          { headers: authHeaders() },
        ),
      ]);

      if (bookingsRes.status === "fulfilled") {
        setEntries(bookingsRes.value.data.entries ?? []);
      } else {
        setError(
          extractError(
            bookingsRes.reason,
            "Failed to load split ticket bookings.",
          ),
        );
      }

      if (cancellationsRes.status === "fulfilled") {
        setCancellations(cancellationsRes.value.data ?? []);
      }
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
      .reduce((sum, e) => sum + e.amount, 0);

    return { total, manualPending, confirmed, paid, totalRevenue };
  }, [entries]);

  // Cancellation Metrics
  const cancellationMetrics = useMemo(() => {
    const total = cancellations.length;
    const pending = cancellations.filter((c) => c.status === "PENDING").length;
    const processed = cancellations.filter(
      (c) => c.status === "PROCESSED",
    ).length;
    const rejected = cancellations.filter(
      (c) => c.status === "REJECTED",
    ).length;
    return { total, pending, processed, rejected };
  }, [cancellations]);

  // Filtered Cancellations
  const filteredCancellations = useMemo(() => {
    return cancellations.filter((c) => {
      if (
        cancellationStatusFilter !== "all" &&
        c.status !== cancellationStatusFilter
      ) {
        return false;
      }
      if (!cancellationSearch.trim()) return true;
      const q = cancellationSearch.toLowerCase().trim();
      const refMatch = c.bookingRef.toLowerCase().includes(q);
      const phoneMatch = c.mobile.includes(q);
      const reasonMatch = c.reason?.toLowerCase().includes(q) ?? false;
      const trainMatch =
        c.booking?.trainNumber.toLowerCase().includes(q) ||
        (c.booking?.trainName?.toLowerCase().includes(q) ?? false);
      const notesMatch = c.adminNotes?.toLowerCase().includes(q) ?? false;
      const passengerMatch =
        c.booking?.passengers?.adults?.some((p) =>
          p.name.toLowerCase().includes(q),
        ) ?? false;
      return (
        refMatch ||
        phoneMatch ||
        reasonMatch ||
        trainMatch ||
        notesMatch ||
        passengerMatch
      );
    });
  }, [cancellations, cancellationStatusFilter, cancellationSearch]);

  const openCancellationModal = (c: CancellationAdminEntry) => {
    setActionCancellation(c);
    setActionStatus(c.status);
    setActionNotes(c.adminNotes || "");
    setCancellationActionError("");
  };

  const handleSaveCancellation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionCancellation || savingCancellation) return;
    setSavingCancellation(true);
    setCancellationActionError("");
    try {
      await apiClient.patch(
        `/api/split-booking/admin/cancellations/${actionCancellation.id}`,
        {
          status: actionStatus,
          adminNotes: actionNotes,
        },
        { headers: authHeaders() },
      );
      setActionCancellation(null);
      await load();
    } catch (err) {
      setCancellationActionError(
        extractError(err, "Failed to update cancellation request."),
      );
    } finally {
      setSavingCancellation(false);
    }
  };

  const openCancelAndRefundModal = (b: SplitBookingAdminEntry) => {
    setRefundBooking(b);
    setRefundReason("");
    setRefundModalError("");
    setRefundSuccessMsg("");
  };

  const handleProcessCancelAndRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundBooking || processingRefund) return;
    setProcessingRefund(true);
    setRefundModalError("");
    setRefundSuccessMsg("");
    try {
      const res = await apiClient.post<{
        success: boolean;
        refundId: string;
        refundAmount: number;
        emailSent: boolean;
        message: string;
      }>(
        `/api/split-booking/admin/${refundBooking.id}/cancel-and-refund`,
        { reason: refundReason.trim() || undefined },
        { headers: authHeaders() },
      );

      const emailNote = res.data.emailSent
        ? " Automated refund email sent to customer."
        : " (Customer email was not configured or skipped).";
      setRefundSuccessMsg(
        `Success: Refund of ₹${res.data.refundAmount} initiated (Refund ID: ${res.data.refundId}).${emailNote}`,
      );
      await load();
      setTimeout(() => {
        setRefundBooking(null);
        setRefundSuccessMsg("");
      }, 2500);
    } catch (err) {
      setRefundModalError(
        extractError(err, "Failed to cancel booking and initiate refund."),
      );
    } finally {
      setProcessingRefund(false);
    }
  };

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
    if (selectedFile.size > MAX_PDF_BYTES) {
      setPdfError(
        "The selected PDF exceeds the 25MB limit. Please choose a smaller ticket PDF.",
      );
      return;
    }
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

    if (notifyPdfFile && notifyPdfFile.size > MAX_PDF_BYTES) {
      setNotifyMissingWarning(
        "The selected PDF exceeds the 25MB limit. Please choose a smaller ticket PDF.",
      );
      return;
    }

    // Check for missing PNRs or PDF
    const missingLegs: number[] = [];
    notifyBooking.legsPayload.forEach((_, idx) => {
      if (!notifyLegPnrs[idx]?.trim()) {
        missingLegs.push(idx + 1);
      }
    });
    const hasPdf = notifyBooking.hasTicketPdf || !!notifyPdfFile;

    if (missingLegs.length > 0 || !hasPdf) {
      const missingDetails: string[] = [];
      if (missingLegs.length > 0) {
        missingDetails.push(`PNR for Leg ${missingLegs.join(", ")}`);
      }
      if (!hasPdf) {
        missingDetails.push("Ticket PDF");
      }
      const confirmSend = window.confirm(
        `Missing details:\n• ${missingDetails.join("\n• ")}\n\nDo you want to proceed and notify the passenger without them?`,
      );
      if (!confirmSend) {
        setNotifyMissingWarning(
          `Please provide ${missingDetails.join(" and ")} before sending notification.`,
        );
        return;
      }
    }

    setSendingNotify(true);
    setNotifyFeedback(null);
    setNotifyMissingWarning(null);

    try {
      let pdfPayload:
        { base64: string; filename?: string; contentType?: string } | undefined;

      if (notifyPdfFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(notifyPdfFile);
        const base64Data = await base64Promise;
        pdfPayload = {
          base64: base64Data,
          filename: notifyPdfFile.name,
          contentType: notifyPdfFile.type || "application/pdf",
        };
      }

      const res = await apiClient.post<{
        ok: boolean;
        emailSent: boolean;
        whatsappSent: boolean;
      }>(
        `/api/split-booking/admin/${notifyBooking.id}/notify-user`,
        {
          channel: "email",
          message: notifyMessage.trim() || undefined,
          pnrLeg1: notifyLegPnrs[0]?.trim() || undefined,
          pnrLeg2: notifyLegPnrs[1]?.trim() || undefined,
          pnrs: notifyLegPnrs.map((p) => p.trim()).filter(Boolean),
          pdf: pdfPayload,
        },
        { headers: authHeaders() },
      );

      setNotifyFeedback({
        type: res.data.emailSent ? "success" : "error",
        message: res.data.emailSent
          ? "Email sent"
          : "Email failed or unconfigured",
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
            Fulfill manual split reservations, manage PNRs, attach PDFs, and
            notify passengers.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("bookings")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition sm:text-sm ${
            activeTab === "bookings"
              ? "shadow-xs bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>All Bookings</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              activeTab === "bookings"
                ? "bg-slate-800 text-white"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {entries.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("cancellations")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition sm:text-sm ${
            activeTab === "cancellations"
              ? "shadow-xs bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>Cancellation Requests</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              cancellationMetrics.pending > 0
                ? "bg-amber-500 text-white"
                : activeTab === "cancellations"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-200 text-slate-700"
            }`}
          >
            {cancellations.length}
            {cancellationMetrics.pending > 0
              ? ` (${cancellationMetrics.pending} pending)`
              : ""}
          </span>
        </button>
      </div>

      {activeTab === "bookings" && (
        <div className="space-y-6">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="shadow-xs rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-medium text-slate-500">
                Total Requests
              </span>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {metrics.total}
              </p>
            </div>
            <div className="shadow-xs rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <span className="text-xs font-medium text-amber-800">
                Awaiting Manual
              </span>
              <p className="mt-1 text-2xl font-bold text-amber-900">
                {metrics.manualPending}
              </p>
            </div>
            <div className="shadow-xs rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <span className="text-xs font-medium text-emerald-800">
                Confirmed
              </span>
              <p className="mt-1 text-2xl font-bold text-emerald-900">
                {metrics.confirmed}
              </p>
            </div>
            <div className="shadow-xs rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <span className="text-xs font-medium text-blue-800">
                Payments Received
              </span>
              <p className="mt-1 text-2xl font-bold text-blue-900">
                {metrics.paid}
              </p>
            </div>
            <div className="shadow-xs col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-1">
              <span className="text-xs font-medium text-slate-500">
                Total Collected
              </span>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                ₹{metrics.totalRevenue.toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="shadow-xs flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Booking Ref, Train, Passenger, Phone, Email, PNR…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="focus:outline-hidden rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-600/20"
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
          <div className="shadow-xs overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                      <th className="px-4 py-3">Passenger & Contact</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Fulfillment</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEntries.map((b) => {
                      const statusConf = BOOKING_STATUS_STYLES[
                        b.bookingStatus
                      ] || {
                        badge: "bg-slate-100 text-slate-700",
                        label: b.bookingStatus,
                      };
                      const paymentConf = PAYMENT_STATUS_STYLES[
                        b.paymentStatus
                      ] || {
                        badge: "bg-slate-100 text-slate-700",
                        label: b.paymentStatus,
                      };

                      return (
                        <tr
                          key={b.id}
                          onClick={() => setSelectedDetailsBooking(b)}
                          className="cursor-pointer transition-colors hover:bg-blue-50/40"
                          title="Click row to view full ticket details"
                        >
                          {/* Booking Ref */}
                          <td className="px-4 py-3.5 align-top">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900">
                                {b.bookingRef}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(b.bookingRef);
                                }}
                                className="cursor-pointer text-slate-400 hover:text-slate-600"
                                title="Copy Ref"
                              >
                                {copiedRef === b.bookingRef ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                            <span className="mt-0.5 block text-[11px] text-slate-400">
                              {new Date(b.createdAt).toLocaleDateString(
                                "en-IN",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                            {b.autoUpgrade && (
                              <span className="py-0.2 mt-1 inline-block rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-600">
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

                          {/* Passenger & Contact */}
                          <td className="px-4 py-3.5 align-top">
                            <div className="space-y-0.5">
                              {b.passengers?.adults?.map((p, pIdx) => (
                                <div
                                  key={pIdx}
                                  className="font-medium text-slate-800"
                                >
                                  {p.name}{" "}
                                  <span className="text-[11px] text-slate-400">
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
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  {b.contactMobile}
                                </a>
                              </div>
                              <div>
                                <a
                                  href={`mailto:${b.contactEmail}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex max-w-[160px] items-center gap-1 truncate text-blue-600 hover:underline"
                                >
                                  <Mail className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {b.contactEmail}
                                  </span>
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
                              <span className="mt-1 block max-w-[110px] truncate font-mono text-[10px] text-slate-500">
                                {b.razorpayPaymentId}
                              </span>
                            )}
                            {b.paidAt && (
                              <span className="mt-0.5 block text-[10px] text-slate-400">
                                {new Date(b.paidAt).toLocaleTimeString(
                                  "en-IN",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
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
                                className="mt-1 block max-w-[140px] truncate text-[10px] text-rose-600"
                                title={b.bookingError}
                              >
                                {b.bookingError}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right align-top">
                            <div
                              className="flex flex-col items-end gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => openEditModal(b)}
                                className="shadow-xs inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                <Edit3 className="h-3 w-3 text-slate-500" />
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => openNotifyModal(b)}
                                className="shadow-xs inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-700"
                              >
                                <Mail className="h-3 w-3" />
                                Notify
                              </button>

                              {b.paymentStatus === "PAID" &&
                                b.bookingStatus !== "CANCELLED" && (
                                  <button
                                    type="button"
                                    onClick={() => openCancelAndRefundModal(b)}
                                    className="shadow-xs inline-flex cursor-pointer items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 transition hover:bg-purple-100"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Cancel & Refund
                                  </button>
                                )}

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
        </div>
      )}

      {/* CANCELLATION REQUESTS VIEW */}
      {activeTab === "cancellations" && (
        <div className="space-y-6">
          {/* Cancellation Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="shadow-xs rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-medium text-slate-500">
                Total Cancellation Requests
              </span>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {cancellationMetrics.total}
              </p>
            </div>
            <div className="shadow-xs rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <span className="text-xs font-medium text-amber-800">
                Pending Review
              </span>
              <p className="mt-1 text-2xl font-bold text-amber-900">
                {cancellationMetrics.pending}
              </p>
            </div>
            <div className="shadow-xs rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <span className="text-xs font-medium text-emerald-800">
                Processed & Refunded
              </span>
              <p className="mt-1 text-2xl font-bold text-emerald-900">
                {cancellationMetrics.processed}
              </p>
            </div>
            <div className="shadow-xs rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
              <span className="text-xs font-medium text-rose-800">
                Rejected
              </span>
              <p className="mt-1 text-2xl font-bold text-rose-900">
                {cancellationMetrics.rejected}
              </p>
            </div>
          </div>

          {/* Cancellation Search & Filter */}
          <div className="shadow-xs flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search cancellations by Booking Ref, Mobile, Train, Reason…"
                value={cancellationSearch}
                onChange={(e) => setCancellationSearch(e.target.value)}
                className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={cancellationStatusFilter}
                onChange={(e) => setCancellationStatusFilter(e.target.value)}
                className="focus:outline-hidden rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="all">All Request Statuses</option>
                <option value="PENDING">Pending Review</option>
                <option value="PROCESSED">Processed & Refunded</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          {/* Cancellation Requests Table */}
          <div className="shadow-xs overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {filteredCancellations.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                No cancellation requests found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Requested At</th>
                      <th className="px-4 py-3">Booking Ref</th>
                      <th className="px-4 py-3">Train & Route</th>
                      <th className="px-4 py-3">Customer Contact</th>
                      <th className="px-4 py-3">Amount & PNRs</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Admin Notes</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCancellations.map((c) => {
                      const statusStyle =
                        CANCELLATION_STATUS_STYLES[c.status] ||
                        CANCELLATION_STATUS_STYLES.PENDING;
                      const booking = c.booking;
                      const pnrList = [
                        booking?.pnrLeg1,
                        booking?.pnrLeg2,
                        ...(booking?.pnrs || []),
                      ]
                        .filter(Boolean)
                        .join(", ");

                      return (
                        <tr
                          key={c.id}
                          className="transition hover:bg-slate-50/50"
                        >
                          <td className="whitespace-nowrap px-4 py-3.5 align-top">
                            <span className="block font-medium text-slate-800">
                              {new Date(c.createdAt).toLocaleDateString(
                                "en-IN",
                                {
                                  day: "2-digit",
                                  month: "short",
                                },
                              )}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {new Date(c.createdAt).toLocaleTimeString(
                                "en-IN",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3.5 align-top">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900">
                                {c.bookingRef}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(c.bookingRef)}
                                className="text-slate-400 transition hover:text-slate-600"
                                title="Copy Booking Ref"
                              >
                                {copiedRef === c.bookingRef ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 align-top">
                            {booking ? (
                              <div>
                                <span className="block font-bold text-slate-900">
                                  {booking.trainNumber}{" "}
                                  {booking.trainName || ""}
                                </span>
                                <span className="text-[11px] text-slate-600">
                                  {booking.fromStationCode} →{" "}
                                  {booking.toStationCode}
                                </span>
                                <span className="block text-[10px] text-slate-400">
                                  {booking.journeyDate} • {booking.travelClass}
                                </span>
                              </div>
                            ) : (
                              <span className="italic text-slate-400">
                                Booking data unavailable
                              </span>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3.5 align-top">
                            <div>
                              <a
                                href={`tel:${c.mobile}`}
                                className="block font-bold text-blue-600 hover:underline"
                              >
                                {c.mobile}
                              </a>
                              {booking?.contactEmail && (
                                <a
                                  href={`mailto:${booking.contactEmail}`}
                                  className="block max-w-[140px] truncate text-[11px] text-slate-500 hover:underline"
                                >
                                  {booking.contactEmail}
                                </a>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 align-top">
                            <span className="block font-bold text-slate-900">
                              ₹
                              {booking
                                ? booking.amount.toLocaleString("en-IN")
                                : "—"}
                            </span>
                            {pnrList ? (
                              <span className="block font-mono text-[10px] text-slate-600">
                                PNR: {pnrList}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                No PNRs
                              </span>
                            )}
                          </td>

                          <td className="max-w-[200px] px-4 py-3.5 align-top">
                            <span className="text-xs italic text-slate-700">
                              {c.reason || "None"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3.5 align-top">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyle.badge}`}
                            >
                              {statusStyle.label}
                            </span>
                            {c.processedAt && (
                              <span className="mt-0.5 block text-[10px] text-slate-400">
                                {new Date(c.processedAt).toLocaleDateString(
                                  "en-IN",
                                )}
                              </span>
                            )}
                          </td>

                          <td className="max-w-[200px] px-4 py-3.5 align-top">
                            <span className="text-xs text-slate-700">
                              {c.adminNotes || "—"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3.5 text-right align-top">
                            <div className="flex flex-col items-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openCancellationModal(c)}
                                className="shadow-xs inline-flex cursor-pointer items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800"
                              >
                                Update Status
                              </button>

                              {booking && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const full = entries.find(
                                      (e) => e.id === c.bookingId,
                                    );
                                    if (full) openEditModal(full);
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50"
                                >
                                  View Booking
                                </button>
                              )}

                              {c.status !== "PROCESSED" &&
                                booking &&
                                booking.paymentStatus === "PAID" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const full = entries.find(
                                        (e) => e.id === c.bookingId,
                                      );
                                      if (full) {
                                        openCancelAndRefundModal(full);
                                      } else {
                                        openCancelAndRefundModal({
                                          id: c.bookingId,
                                          bookingRef: c.bookingRef,
                                          trainNumber: booking.trainNumber,
                                          trainName: booking.trainName,
                                          fromStationCode:
                                            booking.fromStationCode,
                                          toStationCode: booking.toStationCode,
                                          journeyDate: booking.journeyDate,
                                          travelClass: booking.travelClass,
                                          quota: "GN",
                                          totalFare: booking.totalFare,
                                          serviceFee: booking.serviceFee,
                                          irctcServiceFee:
                                            booking.irctcServiceFee,
                                          paymentGatewayFee:
                                            booking.paymentGatewayFee,
                                          amount: booking.amount,
                                          legsPayload: [],
                                          passengers: { adults: [] },
                                          contactMobile: booking.contactMobile,
                                          contactEmail: booking.contactEmail,
                                          autoUpgrade: true,
                                          paymentStatus: "PAID",
                                          payUrl: null,
                                          razorpayOrderId: null,
                                          razorpayPaymentId: null,
                                          paidAt: null,
                                          bookingMode: "AI",
                                          bookingStatus:
                                            booking.bookingStatus as SplitBookingAdminEntry["bookingStatus"],
                                          manualEmailSentAt: null,
                                          manualWhatsappSentAt: null,
                                          customerEmailSentAt: null,
                                          customerWhatsappSentAt: null,
                                          pnrs: booking.pnrs || [],
                                          pnrLeg1: booking.pnrLeg1,
                                          pnrLeg2: booking.pnrLeg2,
                                          ticketPdfFilename: null,
                                          ticketPdfContentType: null,
                                          ticketPdfUploadedAt: null,
                                          hasTicketPdf: false,
                                          bookingError: null,
                                          completedAt: null,
                                          createdAt: c.createdAt,
                                          updatedAt: c.updatedAt,
                                        });
                                      }
                                    }}
                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 transition hover:bg-purple-100"
                                  >
                                    <RotateCcw className="h-2.5 w-2.5" />
                                    Full Refund
                                  </button>
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
        </div>
      )}
      {editingBooking && (
        <div
          className="backdrop-blur-xs fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
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
                  {editingBooking.bookingRef} · Train{" "}
                  {editingBooking.trainNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBooking(null)}
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Booking Status
                  </label>
                  <select
                    value={editBookingStatus}
                    onChange={(e) =>
                      setEditBookingStatus(
                        e.target
                          .value as SplitBookingAdminEntry["bookingStatus"],
                      )
                    }
                    className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-600/20"
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
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Payment Status
                  </label>
                  <select
                    value={editPaymentStatus}
                    onChange={(e) =>
                      setEditPaymentStatus(
                        e.target
                          .value as SplitBookingAdminEntry["paymentStatus"],
                      )
                    }
                    className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-600/20"
                  >
                    <option value="PAID">Paid</option>
                    <option value="PENDING">Pending</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Payment Transaction ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. pay_XXXXX or UPI reference"
                  value={editPaymentId}
                  onChange={(e) => setEditPaymentId(e.target.value)}
                  className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Leg 1 PNR (10 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. 2345678901"
                    value={editPnr1}
                    onChange={(e) => setEditPnr1(e.target.value)}
                    className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2 font-mono text-xs text-slate-800 focus:ring-2 focus:ring-blue-600/20"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {editingBooking.legsPayload?.[0]?.from} →{" "}
                    {editingBooking.legsPayload?.[0]?.to}
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Leg 2 PNR (10 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. 6543210987"
                    value={editPnr2}
                    onChange={(e) => setEditPnr2(e.target.value)}
                    className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2 font-mono text-xs text-slate-800 focus:ring-2 focus:ring-blue-600/20"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {editingBooking.legsPayload?.[1]?.from} →{" "}
                    {editingBooking.legsPayload?.[1]?.to}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Booking Error / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Visible to user if failed"
                  value={editError}
                  onChange={(e) => setEditError(e.target.value)}
                  className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingBooking(null)}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="shadow-xs cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
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
          className="backdrop-blur-xs fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
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
                  {pdfUploadBooking.bookingRef} ·{" "}
                  {pdfUploadBooking.contactEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPdfUploadBooking(null)}
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUploadPdf} className="mt-4 space-y-4">
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center transition hover:bg-slate-100/60">
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
                  IRCTC e-ticket PDF up to 25MB
                </p>
                {selectedFile && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)}{" "}
                    KB)
                  </div>
                )}
              </div>

              {pdfError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                  {pdfError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => setPdfUploadBooking(null)}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || uploadingPdf}
                  className="shadow-xs cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
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
          className="backdrop-blur-xs fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Notify Passenger
                </h3>
                <p className="text-xs text-slate-500">
                  Provide PNR for each leg & ticket PDF to send complete
                  confirmation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotifyBooking(null)}
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendNotification} className="mt-4 space-y-4">
              {/* Recipient summary */}
              <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Passenger / Email:</span>
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
                  <span className="text-slate-500">Train & Journey:</span>
                  <span className="font-semibold text-slate-900">
                    {notifyBooking.trainNumber} ({notifyBooking.fromStationCode}{" "}
                    → {notifyBooking.toStationCode}) on{" "}
                    {notifyBooking.journeyDate}
                  </span>
                </div>
              </div>

              {/* PNR for Each Leg */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-800">
                    <Train className="h-3.5 w-3.5 text-blue-600" />
                    PNR for each Leg <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] font-medium text-slate-500">
                    {notifyLegPnrs.filter(Boolean).length} of{" "}
                    {notifyBooking.legsPayload.length} legs filled
                  </span>
                </div>

                <div className="space-y-2">
                  {notifyBooking.legsPayload.map((leg, idx) => {
                    const isFilled = !!notifyLegPnrs[idx]?.trim();
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3 transition ${
                          isFilled
                            ? "border-emerald-200 bg-emerald-50/20"
                            : "border-slate-200 bg-slate-50/60"
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                              {idx + 1}
                            </span>
                            Leg {idx + 1}: {leg.from} → {leg.to} (
                            {leg.travelClass})
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {leg.boardingDate}
                            {leg.departureTime
                              ? ` at ${leg.departureTime}`
                              : ""}
                            {leg.availability && (
                              <span className="ml-1.5 font-semibold text-emerald-700">
                                ({leg.availability})
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            maxLength={10}
                            value={notifyLegPnrs[idx] || ""}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              const next = [...notifyLegPnrs];
                              next[idx] = val;
                              setNotifyLegPnrs(next);
                            }}
                            placeholder={`Enter 10-digit PNR for Leg ${idx + 1} (${leg.from} → ${leg.to})`}
                            className={`focus:outline-hidden w-full rounded-lg border bg-white px-3 py-2 font-mono text-xs font-semibold tracking-wider text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:ring-1 ${
                              isFilled
                                ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500"
                                : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                            }`}
                          />
                          {notifyLegPnrs[idx]?.length === 10 && (
                            <span className="absolute right-2.5 top-2 text-[11px] font-semibold text-emerald-600">
                              ✓ 10 digits
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ticket PDF Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-800">
                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                    Ticket PDF <span className="text-rose-500">*</span>
                  </label>
                  {notifyBooking.hasTicketPdf && !notifyPdfFile && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> PDF on file
                    </span>
                  )}
                </div>

                {notifyBooking.hasTicketPdf && !notifyPdfFile ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-900">
                          {notifyBooking.ticketPdfFilename ||
                            `ticket-${notifyBooking.bookingRef}.pdf`}
                        </span>
                        <span className="ml-1.5 text-slate-500">
                          (Uploaded)
                        </span>
                      </div>
                    </div>
                    <label className="cursor-pointer text-[11px] font-semibold text-blue-600 underline hover:text-blue-800">
                      Upload New PDF
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.type && file.type !== "application/pdf") {
                              alert("Please upload a PDF file.");
                              return;
                            }
                            setNotifyPdfFile(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <div
                    className={`rounded-xl border-2 border-dashed p-3 text-center transition ${
                      notifyPdfFile
                        ? "border-emerald-300 bg-emerald-50/30"
                        : "border-slate-300 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                  >
                    {notifyPdfFile ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-left">
                          <FileText className="h-5 w-5 text-emerald-600" />
                          <div>
                            <p className="text-xs font-semibold text-slate-900">
                              {notifyPdfFile.name}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {(notifyPdfFile.size / 1024).toFixed(1)} KB (Will
                              be attached & linked)
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNotifyPdfFile(null)}
                          className="cursor-pointer text-xs font-semibold text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center justify-center py-2">
                        <Upload className="mb-1 h-5 w-5 text-slate-400" />
                        <span className="text-xs font-semibold text-blue-600 hover:underline">
                          Select or drop ticket PDF (.pdf)
                        </span>
                        <span className="mt-0.5 text-[11px] text-slate-500">
                          PDF containing confirmed IRCTC e-tickets
                        </span>
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (
                                file.type &&
                                file.type !== "application/pdf"
                              ) {
                                alert("Please upload a PDF file.");
                                return;
                              }
                              setNotifyPdfFile(file);
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>

              {/* Customer booking notifications are email-only for now. */}
              <div>
                <p className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Notification Channel
                </p>
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  Email only. Customer booking WhatsApp notifications are
                  paused.
                </p>
              </div>

              {/* Custom message */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Custom Operator Note (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Berths assigned: S3-21 and S5-44. Enjoy your journey!"
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              {notifyMissingWarning && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{notifyMissingWarning}</span>
                </div>
              )}

              {notifyFeedback && (
                <div
                  className={`rounded-xl p-3 text-xs font-semibold ${
                    notifyFeedback.type === "success"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {notifyFeedback.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => setNotifyBooking(null)}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={sendingNotify}
                  className="shadow-xs inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {sendingNotify ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Saving & Sending…
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

      {/* --- 4. Cancellation Action Modal --- */}
      {actionCancellation && (
        <div
          className="backdrop-blur-xs fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Manage Cancellation Request
                </h3>
                <p className="text-xs text-slate-500">
                  Booking Ref:{" "}
                  <span className="font-mono font-bold text-slate-800">
                    {actionCancellation.bookingRef}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionCancellation(null)}
                className="cursor-pointer rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCancellation} className="mt-4 space-y-4">
              <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer Mobile:</span>
                  <span className="font-bold text-slate-800">
                    {actionCancellation.mobile}
                  </span>
                </div>
                {actionCancellation.booking && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Train & Route:</span>
                      <span className="font-semibold text-slate-800">
                        {actionCancellation.booking.trainNumber} (
                        {actionCancellation.booking.fromStationCode} →{" "}
                        {actionCancellation.booking.toStationCode})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Paid:</span>
                      <span className="font-bold text-emerald-700">
                        ₹
                        {actionCancellation.booking.amount.toLocaleString(
                          "en-IN",
                        )}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Reason:</span>
                  <span className="font-medium italic text-slate-700">
                    {actionCancellation.reason || "None specified"}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Request Status *
                </label>
                <select
                  value={actionStatus}
                  onChange={(e) =>
                    setActionStatus(
                      e.target.value as "PENDING" | "PROCESSED" | "REJECTED",
                    )
                  }
                  className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600/20"
                >
                  <option value="PENDING">Pending Review</option>
                  <option value="PROCESSED">Processed & Refunded</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Admin Internal Notes / Refund Details
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Cancelled on IRCTC. Refund amount ₹1,850 credited. Transaction ARN / Razorpay Refund ID: rfc_123456"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              {cancellationActionError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                  {cancellationActionError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => setActionCancellation(null)}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCancellation}
                  className="shadow-xs inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingCancellation ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save & Update"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- 5. Cancel Booking & Full Refund Modal --- */}
      {refundBooking && (
        <div
          className="backdrop-blur-xs fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                  <RotateCcw className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cancel Booking & Issue Full Refund
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ref:{" "}
                    <span className="font-mono font-bold text-slate-800">
                      {refundBooking.bookingRef}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!processingRefund) setRefundBooking(null);
                }}
                className="cursor-pointer rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleProcessCancelAndRefund}
              className="mt-4 space-y-4"
            >
              {/* Summary of refund action */}
              <div className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 text-xs">
                <div className="flex items-center justify-between border-b border-purple-200/60 pb-2">
                  <span className="font-medium text-slate-600">
                    Total Refund Amount:
                  </span>
                  <span className="text-base font-bold text-purple-700">
                    {formatBookingAmount(refundBooking.amount)}{" "}
                    <span className="text-[11px] font-normal text-purple-600">
                      (Full 100%)
                    </span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Passenger / Train:</span>
                  <span className="font-semibold text-slate-800">
                    Train {refundBooking.trainNumber} (
                    {refundBooking.fromStationCode} →{" "}
                    {refundBooking.toStationCode})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer Email:</span>
                  <span className="font-semibold text-slate-800">
                    {refundBooking.contactEmail}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer Mobile:</span>
                  <span className="font-semibold text-slate-800">
                    {refundBooking.contactMobile}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment ID:</span>
                  <span className="font-mono text-slate-700">
                    {refundBooking.razorpayPaymentId ||
                      refundBooking.muzoboxPaymentId ||
                      "Recorded Payment"}
                  </span>
                </div>
              </div>

              <div className="space-y-1 rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900">
                <div className="flex items-center gap-1.5 font-semibold text-blue-800">
                  <Mail className="h-3.5 w-3.5" />
                  Automated Customer Email Notification
                </div>
                <p className="text-[11px] leading-relaxed text-blue-700">
                  An automated email will be sent immediately to{" "}
                  <strong>{refundBooking.contactEmail}</strong> containing the
                  cancellation notice, full refund amount (
                  {formatBookingAmount(refundBooking.amount)}
                  ), and the generated Refund ID reference.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Cancellation & Refund Reason (Internal & Audit)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Passenger requested cancellation / Trains unavailable"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-purple-600/20"
                />
              </div>

              {refundModalError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {refundModalError}
                </div>
              )}

              {refundSuccessMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                  {refundSuccessMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  disabled={processingRefund}
                  onClick={() => setRefundBooking(null)}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={processingRefund}
                  className="shadow-xs inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-purple-800 disabled:opacity-50"
                >
                  {processingRefund ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Refunding…
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Confirm Full Refund & Cancel
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* --- 6. Full Ticket Details Modal (Row Click) --- */}
      {selectedDetailsBooking && (
        <div
          className="backdrop-blur-xs fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700">
                    {selectedDetailsBooking.bookingRef}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      BOOKING_STATUS_STYLES[
                        selectedDetailsBooking.bookingStatus
                      ]?.badge || "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {BOOKING_STATUS_STYLES[selectedDetailsBooking.bookingStatus]
                      ?.label || selectedDetailsBooking.bookingStatus}
                  </span>
                </div>
                <h3 className="mt-1 text-base font-bold text-slate-900">
                  Manual Train Booking Details
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = [
                      "MANUAL TRAIN BOOKING REQUEST",
                      `Booking reference: ${selectedDetailsBooking.bookingRef}`,
                      `Train: ${selectedDetailsBooking.trainNumber}${selectedDetailsBooking.trainName ? ` - ${selectedDetailsBooking.trainName}` : ""}`,
                      `Journey: ${selectedDetailsBooking.fromStationCode} → ${selectedDetailsBooking.toStationCode} on ${selectedDetailsBooking.journeyDate}`,
                      `Requested class: ${selectedDetailsBooking.travelClass} | Quota: ${selectedDetailsBooking.quota}`,
                      ...bookingPriceItems(selectedDetailsBooking).map(
                        ([label, amount]) =>
                          `${label}: ${formatBookingAmount(amount)}`,
                      ),
                      `Total collected: ${formatBookingAmount(selectedDetailsBooking.amount)} | Payment status: ${selectedDetailsBooking.paymentStatus}`,
                      `Payment ID: ${selectedDetailsBooking.razorpayPaymentId || selectedDetailsBooking.muzoboxPaymentId || "Not supplied"}`,
                      `Order ID: ${selectedDetailsBooking.razorpayOrderId || "Not supplied"}`,
                      `Paid at: ${selectedDetailsBooking.paidAt ? new Date(selectedDetailsBooking.paidAt).toISOString() : "Not supplied"}`,
                      `Requested at: ${new Date(selectedDetailsBooking.createdAt).toISOString()}`,
                      "",
                      "JOURNEY LEGS",
                      ...(selectedDetailsBooking.legsPayload || []).map(
                        (leg, idx) =>
                          `${idx + 1}. ${leg.from} → ${leg.to} | Boarding date: ${leg.boardingDate}\nClass: ${leg.travelClass} | Fare: INR ${leg.fare}${leg.availability ? ` | Availability: ${leg.availability}` : ""}\nDeparture: ${leg.departureTime || "Not supplied"} | Arrival: ${leg.arrivalTime || "Not supplied"} | Duration (minutes): ${leg.durationMinutes ?? "Not supplied"}`,
                      ),
                      "",
                      "PASSENGERS",
                      ...(selectedDetailsBooking.passengers?.adults || []).map(
                        (p, idx) =>
                          `${idx + 1}. ${p.name} | Age: ${p.age} | Gender: ${p.gender} | Berth: ${p.berthPreference || "No Preference"}${p.optBerth ? " (Opt Berth)" : ""}${p.foodChoice ? ` | Food: ${p.foodChoice}` : ""} | Senior citizen: ${p.seniorCitizen ? "Yes" : "No"}`,
                      ),
                      "",
                      "CHILDREN / INFANTS (BELOW 5)",
                      ...(selectedDetailsBooking.passengers?.children?.length
                        ? selectedDetailsBooking.passengers.children.map(
                            (c, idx) =>
                              `${idx + 1}. ${c.name} | Age: ${c.age} | Gender: ${c.gender}`,
                          )
                        : ["None"]),
                      "",
                      `Auto-upgrade: ${selectedDetailsBooking.autoUpgrade ? "Yes" : "No"}`,
                      `Book only if confirm berths are allotted: ${selectedDetailsBooking.passengers?.confirmBerthsOnly ? "Yes" : "No"}`,
                      selectedDetailsBooking.passengers?.preferredCoach
                        ? `Preferred Coach: ${selectedDetailsBooking.passengers.preferredCoach}`
                        : null,
                      `Travel Insurance: ${selectedDetailsBooking.passengers?.travelInsurance !== false ? "Yes" : "No"}`,
                      `Customer mobile: ${selectedDetailsBooking.contactMobile}`,
                      `Customer email: ${selectedDetailsBooking.contactEmail}`,
                    ]
                      .filter(Boolean)
                      .join("\n");
                    navigator.clipboard.writeText(text);
                    setCopiedRawDetails(true);
                    setTimeout(() => setCopiedRawDetails(false), 2000);
                  }}
                  className="shadow-xs inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  title="Copy full text as sent to me@kartikarora.in"
                >
                  {copiedRawDetails ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Email Text</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDetailsBooking(null)}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs text-slate-700">
              {/* 1. Train & Journey */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Train & Journey
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Ref: {selectedDetailsBooking.bookingRef}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Train
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {selectedDetailsBooking.trainNumber}{" "}
                      {selectedDetailsBooking.trainName && (
                        <span className="font-medium text-slate-600">
                          - {selectedDetailsBooking.trainName}
                        </span>
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Journey Route & Date
                    </span>
                    <span className="font-semibold text-slate-900">
                      {selectedDetailsBooking.fromStationCode} →{" "}
                      {selectedDetailsBooking.toStationCode} on{" "}
                      {selectedDetailsBooking.journeyDate}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Class & Quota
                    </span>
                    <span className="font-semibold text-slate-800">
                      Class: {selectedDetailsBooking.travelClass} | Quota:{" "}
                      {selectedDetailsBooking.quota}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Auto-Upgrade
                    </span>
                    <span className="font-semibold text-slate-800">
                      {selectedDetailsBooking.autoUpgrade
                        ? "Yes (Requested)"
                        : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Confirm Berths Only
                    </span>
                    <span className="font-semibold text-slate-800">
                      {selectedDetailsBooking.passengers?.confirmBerthsOnly
                        ? "Yes (Required)"
                        : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Preferred Coach
                    </span>
                    <span className="font-semibold text-slate-800">
                      {selectedDetailsBooking.passengers?.preferredCoach ||
                        "None"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Travel Insurance
                    </span>
                    <span className="font-semibold text-slate-800">
                      {selectedDetailsBooking.passengers?.travelInsurance !==
                      false
                        ? "Yes (Opted In)"
                        : "No"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Fare & Payment Info */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Fare & Payment
                </span>
                <BookingPriceBreakdown price={selectedDetailsBooking} />
                <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Total Collected
                    </span>
                    <span className="text-sm font-bold tabular-nums text-slate-900">
                      {formatBookingAmount(selectedDetailsBooking.amount)}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({selectedDetailsBooking.paymentStatus})
                      </span>
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Payment ID
                    </span>
                    <span className="break-all font-mono text-slate-800">
                      {selectedDetailsBooking.razorpayPaymentId ||
                        selectedDetailsBooking.muzoboxPaymentId ||
                        "Not supplied"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Order ID
                    </span>
                    <span className="break-all font-mono text-slate-800">
                      {selectedDetailsBooking.razorpayOrderId || "Not supplied"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Paid At
                    </span>
                    <span className="text-slate-700">
                      {selectedDetailsBooking.paidAt
                        ? new Date(
                            selectedDetailsBooking.paidAt,
                          ).toLocaleString("en-IN")
                        : "Not supplied"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Requested At
                    </span>
                    <span className="text-slate-700">
                      {new Date(
                        selectedDetailsBooking.createdAt,
                      ).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Journey Legs */}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Journey Legs (
                  {selectedDetailsBooking.legsPayload?.length || 0})
                </span>
                <div className="space-y-2">
                  {selectedDetailsBooking.legsPayload?.map((leg, idx) => (
                    <div
                      key={idx}
                      className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/50 p-3"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>
                          Leg {idx + 1}: {leg.from} → {leg.to}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-700">
                          INR {leg.fare}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-0.5 text-[11px] text-slate-600 sm:grid-cols-3">
                        <div>
                          <span className="text-slate-400">
                            Boarding Date:{" "}
                          </span>
                          <span className="font-medium text-slate-800">
                            {leg.boardingDate}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Class: </span>
                          <span className="font-medium text-slate-800">
                            {leg.travelClass}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Availability: </span>
                          <span className="font-semibold text-emerald-700">
                            {leg.availability || "Not supplied"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Duration: </span>
                          <span className="font-medium text-slate-800">
                            {leg.durationMinutes
                              ? `${leg.durationMinutes} mins`
                              : "Not supplied"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Departure: </span>
                          <span className="font-medium text-slate-800">
                            {leg.departureTime || "Not supplied"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Arrival: </span>
                          <span className="font-medium text-slate-800">
                            {leg.arrivalTime || "Not supplied"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Passengers */}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Passengers (
                  {selectedDetailsBooking.passengers?.adults?.length || 0})
                </span>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {selectedDetailsBooking.passengers?.adults?.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between p-2.5 text-xs"
                    >
                      <div className="font-semibold text-slate-900">
                        {idx + 1}. {p.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                        <span>
                          Age: <strong>{p.age}</strong>
                        </span>
                        <span>
                          Gender: <strong>{p.gender}</strong>
                        </span>
                        <span>
                          Berth:{" "}
                          <strong>
                            {p.berthPreference || "No Preference"}
                          </strong>
                        </span>
                        {p.optBerth && (
                          <span className="rounded bg-blue-50 px-1 py-0.5 font-medium text-blue-700">
                            Opt Berth
                          </span>
                        )}
                        {p.foodChoice && (
                          <span>
                            Food: <strong>{p.foodChoice}</strong>
                          </span>
                        )}
                        <span>
                          Senior Citizen:{" "}
                          <strong>{p.seniorCitizen ? "Yes" : "No"}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. Children / Infants below 5 */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Children / Infants (Below 5)
                </span>
                {selectedDetailsBooking.passengers?.children?.length ? (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {selectedDetailsBooking.passengers.children.map(
                      (c, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 text-xs"
                        >
                          <span className="font-semibold text-slate-900">
                            {idx + 1}. {c.name}
                          </span>
                          <span className="text-[11px] text-slate-600">
                            Age: <strong>{c.age}</strong> · Gender:{" "}
                            <strong>{c.gender}</strong>
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="text-xs italic text-slate-400">None</p>
                )}
              </div>

              {/* 6. Customer Contact & PNRs / Ticket Status */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Contact & Fulfillment Status
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Customer Mobile
                    </span>
                    <a
                      href={`https://wa.me/91${selectedDetailsBooking.contactMobile.replace(/\D/g, "").slice(-10)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                    >
                      <MessageSquare className="h-3 w-3" />
                      {selectedDetailsBooking.contactMobile}
                    </a>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Customer Email
                    </span>
                    <a
                      href={`mailto:${selectedDetailsBooking.contactEmail}`}
                      className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                    >
                      <Mail className="h-3 w-3" />
                      {selectedDetailsBooking.contactEmail}
                    </a>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Leg PNRs
                    </span>
                    <div className="font-mono text-xs font-bold text-slate-900">
                      {selectedDetailsBooking.pnrLeg1 && (
                        <div>Leg 1: {selectedDetailsBooking.pnrLeg1}</div>
                      )}
                      {selectedDetailsBooking.pnrLeg2 && (
                        <div>Leg 2: {selectedDetailsBooking.pnrLeg2}</div>
                      )}
                      {!selectedDetailsBooking.pnrLeg1 &&
                        !selectedDetailsBooking.pnrLeg2 &&
                        selectedDetailsBooking.pnrs?.length > 0 &&
                        selectedDetailsBooking.pnrs.map((p, idx) => (
                          <div key={idx}>
                            Leg {idx + 1}: {p}
                          </div>
                        ))}
                      {!selectedDetailsBooking.pnrLeg1 &&
                        !selectedDetailsBooking.pnrLeg2 &&
                        (!selectedDetailsBooking.pnrs ||
                          selectedDetailsBooking.pnrs.length === 0) && (
                          <span className="font-sans font-normal text-slate-400">
                            No PNRs assigned yet
                          </span>
                        )}
                    </div>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">
                      Ticket PDF
                    </span>
                    {selectedDetailsBooking.hasTicketPdf ? (
                      <a
                        href={pdfUrl(selectedDetailsBooking.bookingRef)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Ticket PDF
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPdfUploadBooking(selectedDetailsBooking);
                          setSelectedFile(null);
                          setPdfError("");
                        }}
                        className="mt-0.5 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Attach Ticket PDF
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 p-4">
              <span className="text-[11px] text-slate-400">
                Created{" "}
                {new Date(selectedDetailsBooking.createdAt).toLocaleString(
                  "en-IN",
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedDetailsBooking;
                    setSelectedDetailsBooking(null);
                    openEditModal(b);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                  Edit & Add PNRs
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedDetailsBooking;
                    setSelectedDetailsBooking(null);
                    openNotifyModal(b);
                  }}
                  className="shadow-xs inline-flex cursor-pointer items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Notify Passenger
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDetailsBooking(null)}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SplitBookingsAdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      }
    >
      <SplitBookingsAdminContent />
    </Suspense>
  );
}
