"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { data } = await apiClient.post<{ accessToken?: string; message?: string; error?: string }>("/api/auth/register", { name, email, password });
      if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      setError(ax.response?.data?.message ?? ax.response?.data?.error ?? "Registration failed");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">Create account</h1>
        <p className="mt-1 text-slate-600">Start monitoring train availability.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password (min 8 characters)</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
              minLength={8}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Register
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
