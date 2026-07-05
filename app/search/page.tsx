import { permanentRedirect } from "next/navigation";

// /search is a legacy alias for the homepage search experience (the search UI
// lives at "/"). Redirect server-side with a permanent (308) redirect so search
// engines consolidate it into "/" instead of indexing this stub as a duplicate.
// Any query string is preserved so prefilled searches keep working.
export default async function SearchRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value != null) {
      qs.set(key, value);
    }
  }
  const query = qs.toString();
  permanentRedirect(query ? `/?${query}` : "/");
}
