import { permanentRedirect } from "next/navigation";

// Legacy booking flow — permanently moved to the homepage. Use a permanent (308)
// redirect so search engines drop /booking/v2 and consolidate into "/".
export default function LegacyBookingV2Redirect() {
  permanentRedirect("/");
}
