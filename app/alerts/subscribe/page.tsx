import { Suspense } from "react";
import { SubscribeClient } from "./SubscribeClient";

export const metadata = {
  title: "Chart Alert Subscribed — LastBerth",
  description: "Your IRCTC train chart preparation alert has been activated.",
};

export default function SubscribeAlertPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center text-slate-600">Loading alert details...</div>
        </div>
      }
    >
      <SubscribeClient />
    </Suspense>
  );
}
