"use client";

import { SpecialTrainsListClient } from "@/components/special-trains/SpecialTrainsListClient";
import type { SpecialTrain } from "@/lib/specialTrains";

export function DiwaliTrainsListClient({ trains }: { trains: SpecialTrain[] }) {
  return (
    <SpecialTrainsListClient
      trains={trains}
      festivalKey="diwali"
      festivalTitle="Diwali"
    />
  );
}
