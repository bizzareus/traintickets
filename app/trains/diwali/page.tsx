import { permanentRedirect } from "next/navigation";

export default function LegacyDiwaliTrainsRedirectPage() {
  permanentRedirect("/special-trains/diwali");
}
