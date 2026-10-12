import type { Metadata } from "next";
import { PaymentCompleteClient } from "./PaymentCompleteClient";

export const metadata: Metadata = {
  title: "Search Credits Payment — LastBerth",
  robots: { index: false, follow: false },
};

export default async function PaymentCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  return (
    <PaymentCompleteClient purchaseRef={typeof ref === "string" ? ref : ""} />
  );
}
