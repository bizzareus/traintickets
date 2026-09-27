"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SALE_END_UTC = Date.UTC(2026, 9, 5, 18, 29, 59, 999);

export default function DiwaliSaleArtwork() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setVisible(false),
      Math.max(0, SALE_END_UTC - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <aside
      className="mx-auto mt-4 w-full xl:absolute xl:left-[calc(100%+1.5rem)] xl:top-0 xl:mt-0 xl:w-48 min-[1400px]:w-60"
      aria-label="Diwali chart alert sale"
    >
      <Image
        src="/diwali-chart-alert-sale-mobile.svg"
        alt="Diwali Sale: Get 50% off chart alerts that help find confirmed tickets. Valid till 5 October."
        width={1200}
        height={360}
        unoptimized
        className="h-auto w-full rounded-xl shadow-lg ring-1 ring-amber-300/60 xl:hidden"
      />
      <Image
        src="/diwali-chart-alert-sale.svg"
        alt="Diwali Sale: Get 50% off chart alerts that help find confirmed tickets. Valid till 5 October."
        width={720}
        height={1280}
        unoptimized
        className="hidden h-auto w-full rounded-2xl shadow-xl ring-1 ring-amber-300/60 xl:block"
      />
    </aside>
  );
}
