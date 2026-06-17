export type GlossaryTerm = {
  id: string;
  term: string;
  definition: string;
  relatedTerms?: string[];
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "rlwl",
    term: "RLWL (Remote Location Waiting List)",
    definition: "A waitlist issued for intermediate stations (not the origin or destination). It has lower confirmation chances than GNWL because tickets only confirm if a passenger from that specific remote location cancels.",
    relatedTerms: ["gnwl", "pqwl", "wl"]
  },
  {
    id: "gnwl",
    term: "GNWL (General Waiting List)",
    definition: "The most common waitlist type, issued to passengers traveling from the originating station or stations near it to the destination. GNWL has the highest chance of confirmation as maximum berths are allocated to this quota.",
    relatedTerms: ["rlwl", "pqwl", "wl"]
  },
  {
    id: "pqwl",
    term: "PQWL (Pooled Quota Waiting List)",
    definition: "A pooled waitlist shared among several intermediate stations. PQWL generally has the lowest chances of confirmation.",
    relatedTerms: ["gnwl", "rlwl", "wl"]
  },
  {
    id: "rac",
    term: "RAC (Reservation Against Cancellation)",
    definition: "A status that guarantees you can board the train, but you only get a shared seat (usually half a side-lower berth) rather than a full sleeping berth. It converts to a full berth if confirmed passengers cancel.",
    relatedTerms: ["wl"]
  },
  {
    id: "wl",
    term: "WL (Waiting List)",
    definition: "A status indicating the ticket is not confirmed and does not allow you to board the train (if an e-ticket). You must wait for cancellations to move to RAC or Confirmed.",
    relatedTerms: ["rac"]
  },
  {
    id: "tdr",
    term: "TDR (Ticket Deposit Receipt)",
    definition: "A process to claim a refund for a train ticket under specific conditions like train cancellation, train running late by more than 3 hours, or AC failure.",
  },
  {
    id: "tatkal",
    term: "Tatkal Quota",
    definition: "A premium booking quota that opens one day in advance of the train's departure from its originating station, meant for last-minute travel. It charges a premium over the base fare.",
  },
  {
    id: "current-availability",
    term: "Current Availability",
    definition: "Tickets that remain vacant or become vacant after the chart preparation. These can be booked at standard fare up to 30 minutes before the train departs.",
    relatedTerms: ["tatkal"]
  },
  {
    id: "vikalp",
    term: "Vikalp (Alternate Train Accommodation)",
    definition: "An optional scheme for waitlisted passengers to get confirmed berths in alternate trains on the same route if their primary ticket does not get confirmed.",
  }
];

export function getGlossaryTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find(t => t.id === id);
}

export function getAllGlossaryTerms(): GlossaryTerm[] {
  return [...GLOSSARY_TERMS].sort((a, b) => a.term.localeCompare(b.term));
}
