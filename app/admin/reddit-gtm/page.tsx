"use client";

import { useState, useEffect } from "react";
import moment from "moment";

interface AnalyzedComment {
  id: string;
  content: string;
  author: string;
  permalink: string;
  trainNumber: string | null;
  origin: string | null;
  destination: string | null;
  pnr: string | null;
  dateOfTravel: string | null;
  currentStatus: string | null;
  analyzedAt: string;
}

export default function RedditGTMEngine() {
  const [url, setUrl] = useState("https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<AnalyzedComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchEntries = async (pageNum: number) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3009";
      const res = await fetch(`${apiUrl}/api/admin/reddit-gtm/entries?page=${pageNum}`);
      const data = await res.json();
      setEntries(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error("Failed to fetch entries", err);
    }
  };

  useEffect(() => {
    fetchEntries(page);
  }, [page]);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3009";
      const res = await fetch(`${apiUrl}/api/admin/reddit-gtm/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      console.log("Analyze response data:", data);
      alert(`Analyzed ${data.analyzedCount} new comments!`);
      fetchEntries(1);
      setPage(1);
    } catch (err) {
      console.error("Analysis failed", err);
      alert("Analysis failed. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Reddit GTM Engine</h1>
        <p className="mt-1 text-slate-500">Fetch and analyze train queries from Reddit using AI.</p>
        
        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Reddit JSON URL"
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-2 font-medium text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="-ml-1 mr-3 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing...
              </>
            ) : "Analyze"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex justify-between items-center">
          <h2 className="font-semibold text-slate-800">Recent Analyzed Threads ({total})</h2>
          <div className="flex gap-2">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm self-center">Page {page} of {totalPages}</span>
            <button 
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3">User / Comment</th>
                <th className="px-6 py-3">Train</th>
                <th className="px-6 py-3">Route</th>
                <th className="px-6 py-3">PNR</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">No entries yet. Click analyze to fetch some!</td>
                </tr>
              ) : (
                entries.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">u/{item.author}</div>
                      <a href={item.permalink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-xs line-clamp-1 max-w-[200px]">
                        {item.content}
                      </a>
                    </td>
                    <td className="px-6 py-4 text-slate-700 font-mono">{item.trainNumber || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900 font-medium">{item.origin || "—"}</div>
                      <div className="text-slate-400 text-xs text-center">↓</div>
                      <div className="text-slate-900 font-medium">{item.destination || "—"}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-mono">{item.pnr || "—"}</td>
                    <td className="px-6 py-4 text-slate-600">{item.dateOfTravel || "—"}</td>
                    <td className="px-6 py-4">
                      {item.currentStatus ? (
                        <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
                          {item.currentStatus}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs whitespace-nowrap">
                      {moment(item.analyzedAt).fromNow()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
