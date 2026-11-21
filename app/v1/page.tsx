import { permanentRedirect } from "next/navigation";

// Legacy v1 homepage — permanently redirected to "/" (308) to consolidate search equity and prevent duplicate content.
export default function LegacyV1Redirect() {
  permanentRedirect("/");
}
