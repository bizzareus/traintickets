"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import moment from "moment";
import {
  MousePointerClick,
  Link2,
  Users,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Download,
  Smartphone,
  Laptop,
  Tablet,
  Bot,
  Mail,
  MessageSquare,
  Train,
  ArrowRight,
  Search,
  Calendar,
  X,
  Eye,
  Activity,
} from "lucide-react";

type DeviceInfo = {
  browser: string;
  os: string;
  deviceType: "mobile" | "desktop" | "tablet" | "bot";
};

type UserInfo = {
  email: string | null;
  mobile: string | null;
  name: string | null;
  channel: string | null;
  recipient: string | null;
};

type TrainContextInfo = {
  trainNumber: string | null;
  trainName: string | null;
  fromStation: string | null;
  toStation: string | null;
  journeyDate: string | null;
  classCode: string | null;
  notificationType: string | null;
};

type ClickItem = {
  id: string;
  clickedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  device: DeviceInfo;
  shortLink: {
    id: string;
    code: string;
    shortUrl: string;
    targetUrl: string;
    clickCount: number;
    createdAt: string;
  } | null;
  user: UserInfo;
  trainContext: TrainContextInfo;
};

type LinkItem = {
  id: string;
  code: string;
  shortUrl: string;
  targetUrl: string;
  type: string;
  clickCount: number;
  createdAt: string;
  lastClickedAt: string | null;
  expiresAt: string | null;
  user: UserInfo;
  trainContext: TrainContextInfo;
  recentClicks: Array<{
    id: string;
    clickedAt: string;
    ipAddress: string | null;
    device: DeviceInfo;
    referer: string | null;
  }>;
};

type UserAttributionItem = {
  key: string;
  email: string | null;
  mobile: string | null;
  name: string | null;
  channels: string[];
  totalLinks: number;
  totalClicks: number;
  clickedLinksCount: number;
  clickRate: number;
  firstSeenAt: string;
  lastClickedAt: string | null;
  trains: string[];
};

type OverviewSummary = {
  totalLinks: number;
  totalClicks: number;
  clickedLinksCount: number;
  unclickedLinksCount: number;
  clickThroughRate: number;
  uniqueUsersCount: number;
  recentClicks24h: number;
  recentClicks7d: number;
  clicksByChannel: { whatsapp: number; email: number; direct: number };
  linksByType: { search_redirect: number; chart_alert: number; other: number };
};

export default function AdminShortLinksPage() {
  const [activeTab, setActiveTab] = useState<"clicks" | "links" | "users">("clicks");
  const [overview, setOverview] = useState<OverviewSummary | null>(null);
  const [clicks, setClicks] = useState<ClickItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [users, setUsers] = useState<UserAttributionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowIst, setNowIst] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [preset, setPreset] = useState<"24h" | "7d" | "30d" | "all" | "custom">("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Selected link for click inspection modal
  const [inspectLink, setInspectLink] = useState<LinkItem | null>(null);

  // Clock
  useEffect(() => {
    const update = () => {
      setNowIst(moment().utcOffset("+05:30").format("DD MMM, HH:mm:ss") + " IST");
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // Preset Date range
  useEffect(() => {
    if (preset === "custom") return;
    const end = moment().format("YYYY-MM-DD");
    let start = "";
    if (preset === "24h") {
      start = moment().subtract(1, "days").format("YYYY-MM-DD");
    } else if (preset === "7d") {
      start = moment().subtract(6, "days").format("YYYY-MM-DD");
    } else if (preset === "30d") {
      start = moment().subtract(29, "days").format("YYYY-MM-DD");
    } else if (preset === "all") {
      start = "";
    }
    setStartDate(start);
    setEndDate(start ? end : "");
    setPage(1);
  }, [preset]);

  // Fetch overview & current tab data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (search.trim()) params.append("search", search.trim());
      if (channelFilter !== "all") params.append("channel", channelFilter);
      if (typeFilter !== "all") params.append("type", typeFilter);
      params.append("page", String(page));
      params.append("limit", "25");

      const queryStr = params.toString() ? `?${params.toString()}` : "";

      // Fetch overview in parallel
      const overviewPromise = apiClient.get<{ summary: OverviewSummary }>(
        `/api/short-link/admin/overview${queryStr}`
      );

      if (activeTab === "clicks") {
        const [ovRes, clickRes] = await Promise.all([
          overviewPromise,
          apiClient.get<{ clicks: ClickItem[]; total: number; totalPages: number }>(
            `/api/short-link/admin/clicks${queryStr}`
          ),
        ]);
        setOverview(ovRes.data.summary);
        setClicks(clickRes.data.clicks);
        setTotalCount(clickRes.data.total);
        setTotalPages(clickRes.data.totalPages);
      } else if (activeTab === "links") {
        const [ovRes, linkRes] = await Promise.all([
          overviewPromise,
          apiClient.get<{ links: LinkItem[]; total: number; totalPages: number }>(
            `/api/short-link/admin/links${queryStr}`
          ),
        ]);
        setOverview(ovRes.data.summary);
        setLinks(linkRes.data.links);
        setTotalCount(linkRes.data.total);
        setTotalPages(linkRes.data.totalPages);
      } else if (activeTab === "users") {
        const [ovRes, userRes] = await Promise.all([
          overviewPromise,
          apiClient.get<{ users: UserAttributionItem[]; totalUsers: number }>(
            `/api/short-link/admin/users${queryStr}`
          ),
        ]);
        setOverview(ovRes.data.summary);
        setUsers(userRes.data.users);
        setTotalCount(userRes.data.totalUsers);
        setTotalPages(1);
      }
    } catch (err) {
      console.error("Failed to load short link admin data", err);
      setError("Failed to load short link tracking data. Check if backend is running.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, startDate, endDate, search, channelFilter, typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const copyToClipboard = (text: string, code: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const exportCSV = () => {
    let csvContent = "";
    if (activeTab === "clicks") {
      csvContent = "data:text/csv;charset=utf-8," + [
        ["Clicked At (IST)", "User Name", "Email", "Mobile", "Channel", "Train", "From", "To", "Journey Date", "Short Code", "Target URL", "Device", "OS", "Browser", "IP", "Referer"].join(","),
        ...clicks.map(c => [
          `"${moment.utc(c.clickedAt).utcOffset("+05:30").format("YYYY-MM-DD HH:mm:ss")}"`,
          `"${c.user.name || ""}"`,
          `"${c.user.email || ""}"`,
          `"${c.user.mobile || ""}"`,
          `"${c.user.channel || ""}"`,
          `"${c.trainContext.trainNumber || ""}"`,
          `"${c.trainContext.fromStation || ""}"`,
          `"${c.trainContext.toStation || ""}"`,
          `"${c.trainContext.journeyDate || ""}"`,
          `"${c.shortLink?.code || ""}"`,
          `"${c.shortLink?.targetUrl || ""}"`,
          `"${c.device.deviceType}"`,
          `"${c.device.os}"`,
          `"${c.device.browser}"`,
          `"${c.ipAddress || ""}"`,
          `"${c.referer || ""}"`
        ].join(","))
      ].join("\n");
    } else if (activeTab === "links") {
      csvContent = "data:text/csv;charset=utf-8," + [
        ["Created At", "Code", "Target URL", "Click Count", "Last Clicked At", "Recipient Email", "Recipient Mobile", "User Name", "Channel", "Train"].join(","),
        ...links.map(l => [
          `"${l.createdAt}"`,
          `"${l.code}"`,
          `"${l.targetUrl}"`,
          l.clickCount,
          `"${l.lastClickedAt || ""}"`,
          `"${l.user.email || ""}"`,
          `"${l.user.mobile || ""}"`,
          `"${l.user.name || ""}"`,
          `"${l.user.channel || ""}"`,
          `"${l.trainContext.trainNumber || ""}"`
        ].join(","))
      ].join("\n");
    } else {
      csvContent = "data:text/csv;charset=utf-8," + [
        ["Name", "Email", "Mobile", "Channels", "Total Links Sent", "Total Clicks", "Click Rate %", "First Seen", "Last Clicked", "Trains"].join(","),
        ...users.map(u => [
          `"${u.name || ""}"`,
          `"${u.email || ""}"`,
          `"${u.mobile || ""}"`,
          `"${u.channels.join("/")}"`,
          u.totalLinks,
          u.totalClicks,
          u.clickRate,
          `"${u.firstSeenAt}"`,
          `"${u.lastClickedAt || ""}"`,
          `"${u.trains.join("; ")}"`
        ].join(","))
      ].join("\n");
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `short_links_${activeTab}_${moment().format("YYYYMMDD_HHmmss")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-3.5 w-3.5 text-blue-500" />;
      case "tablet":
        return <Tablet className="h-3.5 w-3.5 text-purple-500" />;
      case "bot":
        return <Bot className="h-3.5 w-3.5 text-amber-500" />;
      default:
        return <Laptop className="h-3.5 w-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Short Links & Click Tracking</h1>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-sm text-slate-500">
              Real-time user engagement, click attribution (email, phone, name), and device telemetry.
            </p>
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              Current: {nowIst}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      {overview && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Short Links</span>
              <Link2 className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{overview.totalLinks}</p>
            <span className="text-[11px] text-slate-400">
              {overview.linksByType.search_redirect} Search • {overview.linksByType.chart_alert} Alerts
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Click Events</span>
              <MousePointerClick className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{overview.totalClicks}</p>
            <span className="text-[11px] text-slate-400">
              {overview.recentClicks24h} in 24h • {overview.recentClicks7d} in 7d
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Click-Through Rate</span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                {overview.clickThroughRate}% CTR
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-indigo-600">{overview.clickedLinksCount}</p>
            <span className="text-[11px] text-slate-400">
              links clicked of {overview.totalLinks} created
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Identified Contacts</span>
              <Users className="h-4 w-4 text-purple-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-purple-600">{overview.uniqueUsersCount}</p>
            <span className="text-[11px] text-slate-400">
              WA: {overview.clicksByChannel.whatsapp} • Email: {overview.clicksByChannel.email} clicks
            </span>
          </div>
        </div>
      )}

      {/* Tabs & Search / Filter Controls */}
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => {
                setActiveTab("clicks");
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                activeTab === "clicks"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Clicks Stream
            </button>
            <button
              onClick={() => {
                setActiveTab("links");
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                activeTab === "links"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              Short Links Directory
            </button>
            <button
              onClick={() => {
                setActiveTab("users");
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                activeTab === "users"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              User Attribution
            </button>
          </div>

          {/* Date range presets */}
          <div className="flex items-center gap-1.5">
            {(["24h", "7d", "30d", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  preset === p
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {p === "24h" && "24 Hours"}
                {p === "7d" && "7 Days"}
                {p === "30d" && "30 Days"}
                {p === "all" && "All Time"}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-xs shadow-sm">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by email, mobile, name, train number, or code..."
              className="w-full bg-transparent text-slate-800 focus:outline-none placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Channel:</span>
              <select
                value={channelFilter}
                onChange={(e) => {
                  setChannelFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">All Channels</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </div>

            {activeTab === "links" && (
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-600">Type:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="search_redirect">Search Redirect</option>
                  <option value="chart_alert">Chart Alert</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setPreset("custom");
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setPreset("custom");
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
            <p className="text-xs text-slate-500">Loading tracking data...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : (
        <>
          {/* TAB 1: Clicks Stream */}
          {activeTab === "clicks" && (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Recent Click Stream ({totalCount})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live feed of short link clicks with identified user and device data.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-700">
                    <tr>
                      <th className="px-6 py-3.5">Time (IST)</th>
                      <th className="px-6 py-3.5">User / Recipient</th>
                      <th className="px-6 py-3.5">Channel</th>
                      <th className="px-6 py-3.5">Train & Route Context</th>
                      <th className="px-6 py-3.5">Link / Target</th>
                      <th className="px-6 py-3.5">Device & Browser</th>
                      <th className="px-6 py-3.5">IP & Referrer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clicks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                          No click events recorded for this criteria.
                        </td>
                      </tr>
                    ) : (
                      clicks.map((c) => (
                        <tr key={c.id} className="transition hover:bg-slate-50/50">
                          {/* Time */}
                          <td className="whitespace-nowrap px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">
                                {moment.utc(c.clickedAt).utcOffset("+05:30").format("DD MMM, HH:mm:ss")}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {moment(c.clickedAt).fromNow()}
                              </span>
                            </div>
                          </td>

                          {/* User / Recipient */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-0.5">
                              {c.user.name && (
                                <span className="font-bold text-slate-900 text-xs">
                                  {c.user.name}
                                </span>
                              )}
                              {c.user.email && (
                                <span className="text-xs font-medium text-slate-800 flex items-center gap-1">
                                  <Mail className="h-3 w-3 text-slate-400" />
                                  {c.user.email}
                                </span>
                              )}
                              {c.user.mobile && (
                                <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3 text-slate-400" />
                                  {c.user.mobile}
                                </span>
                              )}
                              {!c.user.email && !c.user.mobile && !c.user.name && (
                                <span className="italic text-slate-400 text-xs">Anonymous Click</span>
                              )}
                            </div>
                          </td>

                          {/* Channel */}
                          <td className="px-6 py-4">
                            {c.user.channel === "whatsapp" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                                <MessageSquare className="h-3 w-3" /> WhatsApp
                              </span>
                            ) : c.user.channel === "email" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200">
                                <Mail className="h-3 w-3" /> Email
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                Direct / Web
                              </span>
                            )}
                          </td>

                          {/* Train & Route Context */}
                          <td className="px-6 py-4">
                            {c.trainContext.trainNumber ? (
                              <div className="flex flex-col gap-0.5 text-xs">
                                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                  <Train className="h-3.5 w-3.5 text-indigo-600" />
                                  <span>{c.trainContext.trainNumber}</span>
                                  {c.trainContext.trainName && (
                                    <span className="font-normal text-slate-500 truncate max-w-[120px]">
                                      ({c.trainContext.trainName})
                                    </span>
                                  )}
                                </div>
                                {c.trainContext.fromStation && c.trainContext.toStation && (
                                  <div className="text-slate-600 flex items-center gap-1 text-[11px]">
                                    <span>{c.trainContext.fromStation}</span>
                                    <ArrowRight className="h-3 w-3 text-slate-400" />
                                    <span>{c.trainContext.toStation}</span>
                                    {c.trainContext.journeyDate && (
                                      <span className="text-slate-400 font-mono ml-1">
                                        • {moment(c.trainContext.journeyDate).format("DD MMM")}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Link / Target */}
                          <td className="px-6 py-4">
                            {c.shortLink ? (
                              <div className="flex flex-col gap-1 text-xs">
                                <div className="flex items-center gap-1.5 font-mono">
                                  <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                    /s/{c.shortLink.code}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(c.shortLink!.shortUrl, c.shortLink!.code)}
                                    className="text-slate-400 hover:text-slate-600"
                                    title="Copy Short URL"
                                  >
                                    {copiedCode === c.shortLink.code ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                                <a
                                  href={c.shortLink.targetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 truncate max-w-[160px]"
                                  title={c.shortLink.targetUrl}
                                >
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                  <span>{c.shortLink.targetUrl.replace(/^https?:\/\/[^/]+/, "")}</span>
                                </a>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Device & Browser */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1 text-xs">
                              <div className="flex items-center gap-1.5">
                                {getDeviceIcon(c.device.deviceType)}
                                <span className="font-semibold text-slate-800">
                                  {c.device.os}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500 truncate max-w-[140px]" title={c.device.browser}>
                                {c.device.browser}
                              </span>
                            </div>
                          </td>

                          {/* IP & Referer */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-0.5 text-[11px]">
                              <span className="font-mono text-slate-700">{c.ipAddress || "—"}</span>
                              <span className="text-slate-400 truncate max-w-[120px]" title={c.referer || ""}>
                                {c.referer ? c.referer.replace(/^https?:\/\//, "") : "Direct"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Page {page} of {totalPages} ({totalCount} items)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Short Links Directory */}
          {activeTab === "links" && (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Generated Short Links ({totalCount})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Overview of all short URLs, click counts, target parameters, and linked recipients.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-700">
                    <tr>
                      <th className="px-6 py-3.5">Short Code</th>
                      <th className="px-6 py-3.5">Target Destination</th>
                      <th className="px-6 py-3.5">Recipient / User</th>
                      <th className="px-6 py-3.5">Train Context</th>
                      <th className="px-6 py-3.5">Created (IST)</th>
                      <th className="px-6 py-3.5">Clicks</th>
                      <th className="px-6 py-3.5">Last Clicked</th>
                      <th className="px-6 py-3.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {links.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                          No short links found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      links.map((link) => (
                        <tr key={link.id} className="transition hover:bg-slate-50/50">
                          {/* Code */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                                /s/{link.code}
                              </span>
                              <button
                                onClick={() => copyToClipboard(link.shortUrl, link.code)}
                                className="text-slate-400 hover:text-slate-600"
                                title="Copy Full Short URL"
                              >
                                {copiedCode === link.code ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Target */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1 max-w-[200px]">
                              <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 uppercase">
                                {link.type}
                              </span>
                              <a
                                href={link.targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-slate-600 hover:text-indigo-600 truncate flex items-center gap-1"
                                title={link.targetUrl}
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span>{link.targetUrl}</span>
                              </a>
                            </div>
                          </td>

                          {/* Recipient */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-0.5 text-xs">
                              {link.user.name && (
                                <span className="font-bold text-slate-900">{link.user.name}</span>
                              )}
                              {link.user.email && (
                                <span className="text-slate-800 font-medium">{link.user.email}</span>
                              )}
                              {link.user.mobile && (
                                <span className="text-slate-500 font-mono">{link.user.mobile}</span>
                              )}
                              {!link.user.email && !link.user.mobile && !link.user.name && (
                                <span className="italic text-slate-400">Anonymous</span>
                              )}
                            </div>
                          </td>

                          {/* Train Context */}
                          <td className="px-6 py-4">
                            {link.trainContext.trainNumber ? (
                              <div className="flex flex-col gap-0.5 text-xs">
                                <span className="font-bold text-slate-900">
                                  {link.trainContext.trainNumber}
                                </span>
                                {link.trainContext.fromStation && link.trainContext.toStation && (
                                  <span className="text-[11px] text-slate-500">
                                    {link.trainContext.fromStation} → {link.trainContext.toStation}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Created */}
                          <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-600">
                            {moment.utc(link.createdAt).utcOffset("+05:30").format("DD MMM, HH:mm")}
                          </td>

                          {/* Clicks */}
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ${
                                link.clickCount > 0
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {link.clickCount} {link.clickCount === 1 ? "click" : "clicks"}
                            </span>
                          </td>

                          {/* Last Clicked */}
                          <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-600">
                            {link.lastClickedAt ? (
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-900">
                                  {moment.utc(link.lastClickedAt).utcOffset("+05:30").format("DD MMM, HH:mm")}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {moment(link.lastClickedAt).fromNow()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300">Never</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setInspectLink(link)}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View Clicks ({link.clickCount})
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Page {page} of {totalPages} ({totalCount} items)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: User Attribution */}
          {activeTab === "users" && (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">User Engagement Attribution ({users.length})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aggregated view of users who received short links and their interaction rate.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-700">
                    <tr>
                      <th className="px-6 py-3.5">User / Contact</th>
                      <th className="px-6 py-3.5">Channels</th>
                      <th className="px-6 py-3.5">Links Sent</th>
                      <th className="px-6 py-3.5">Total Clicks</th>
                      <th className="px-6 py-3.5">Click-Through Rate</th>
                      <th className="px-6 py-3.5">Trains Monitored / Viewed</th>
                      <th className="px-6 py-3.5">Last Active (IST)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                          No users matched your query.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.key} className="transition hover:bg-slate-50/50">
                          {/* User Contact */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-0.5">
                              {u.name && (
                                <span className="font-bold text-slate-900 text-xs">{u.name}</span>
                              )}
                              {u.email && (
                                <span className="text-xs font-medium text-slate-800 flex items-center gap-1">
                                  <Mail className="h-3 w-3 text-slate-400" />
                                  {u.email}
                                </span>
                              )}
                              {u.mobile && (
                                <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3 text-slate-400" />
                                  {u.mobile}
                                </span>
                              )}
                              {!u.email && !u.mobile && !u.name && (
                                <span className="italic text-slate-400 text-xs">Anonymous User</span>
                              )}
                            </div>
                          </td>

                          {/* Channels */}
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {u.channels.map((ch) => (
                                <span
                                  key={ch}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                    ch === "whatsapp"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                  }`}
                                >
                                  {ch === "whatsapp" ? <MessageSquare className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                                  {ch}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Links Sent */}
                          <td className="px-6 py-4 font-semibold text-slate-800 text-xs">
                            {u.totalLinks}
                          </td>

                          {/* Total Clicks */}
                          <td className="px-6 py-4 font-bold text-emerald-600 text-xs">
                            {u.totalClicks}
                          </td>

                          {/* CTR */}
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                                u.clickRate >= 50
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : u.clickRate > 0
                                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                    : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {u.clickRate}% ({u.clickedLinksCount}/{u.totalLinks})
                            </span>
                          </td>

                          {/* Trains */}
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1 max-w-[260px]">
                              {u.trains.length > 0 ? (
                                u.trains.map((t) => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                                  >
                                    {t}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </div>
                          </td>

                          {/* Last Active */}
                          <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-600">
                            {u.lastClickedAt ? (
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-900">
                                  {moment.utc(u.lastClickedAt).utcOffset("+05:30").format("DD MMM, HH:mm")}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {moment(u.lastClickedAt).fromNow()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300">No clicks yet</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Clicks Inspector Modal */}
      {inspectLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="relative max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="border-b border-slate-100 bg-slate-50/75 p-6 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                    /s/{inspectLink.code}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    • {inspectLink.clickCount} Total Clicks
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate max-w-lg">
                  Target: {inspectLink.targetUrl}
                </p>
              </div>

              <button
                onClick={() => setInspectLink(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6 space-y-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Recent Clicks Telemetry
              </h4>

              {inspectLink.recentClicks.length === 0 ? (
                <p className="text-center py-8 text-sm text-slate-400">
                  No clicks have been recorded for this short link yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/50 overflow-hidden">
                  {inspectLink.recentClicks.map((click, idx) => (
                    <div key={click.id || idx} className="p-4 flex items-center justify-between text-xs">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">
                            {moment.utc(click.clickedAt).utcOffset("+05:30").format("DD MMM YYYY, HH:mm:ss")}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({moment(click.clickedAt).fromNow()})
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          IP: <code className="font-mono text-slate-700">{click.ipAddress || "Unknown"}</code> • Referrer: {click.referer || "Direct"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-semibold text-slate-700 border border-slate-200">
                          {getDeviceIcon(click.device.deviceType)}
                          {click.device.os} • {click.device.browser}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 bg-slate-50/50 p-4 flex justify-end">
              <button
                onClick={() => setInspectLink(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
