import Link from "next/link";

export default function BlogNotFound() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
        Post not found
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        This blog post doesn&apos;t exist (or it was moved).
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/blog"
          className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          Back to Blog
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
