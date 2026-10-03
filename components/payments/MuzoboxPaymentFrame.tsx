"use client";

import { useEffect, useRef } from "react";

export function MuzoboxPaymentFrame({
  payUrl,
  onPaymentComplete,
}: {
  payUrl: string;
  onPaymentComplete: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const url = new URL(payUrl, "https://muzobox.com");
  url.searchParams.set("iframe", "1");
  const origin = url.origin;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === origin &&
        event.source === frameRef.current?.contentWindow &&
        event.data?.type === "payment_complete" &&
        event.data?.status === "paid"
      ) {
        // The parent rechecks its backend; an iframe message never proves payment.
        onPaymentComplete();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, onPaymentComplete]);

  return (
    <iframe
      ref={frameRef}
      src={url.href}
      title="Complete payment via Muzobox"
      className="h-[520px] w-full border-0 sm:h-[540px]"
      allow="payment"
    />
  );
}
