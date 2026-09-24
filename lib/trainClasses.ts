/**
 * Shared definitions and helpers for Indian Railways travel classes.
 */

export interface TrainClassOption {
  code: string;
  label: string;
  name: string;
}

export const AVAILABLE_TRAIN_CLASSES: readonly TrainClassOption[] = [
  { code: "SL", label: "SL", name: "Sleeper (SL)" },
  { code: "3A", label: "3A", name: "3 AC (3A)" },
  { code: "2A", label: "2A", name: "2 AC (2A)" },
  { code: "1A", label: "1A", name: "1st AC (1A)" },
  { code: "3E", label: "3E", name: "3 AC Economy (3E)" },
  { code: "CC", label: "CC", name: "Chair Car (CC)" },
  { code: "EC", label: "EC", name: "Exec Chair Car (EC)" },
  { code: "2S", label: "2S", name: "Second Sitting (2S)" },
] as const;

export const ALL_TRAIN_CLASS_CODES = AVAILABLE_TRAIN_CLASSES.map((c) => c.code);

/** Set of non-AC classes. */
export const NON_AC_CLASSES = new Set(["SL", "2S", "GN", "FC"]);

/** Checks if a class code is an AC class. */
export function isAcClass(code: string): boolean {
  return !NON_AC_CLASSES.has(code.toUpperCase());
}

/** Normalizes and deduplicates class strings. */
export function normalizeClassCodes(classes?: readonly string[] | null): string[] {
  if (!classes || classes.length === 0) return [];
  const set = new Set<string>();
  for (const c of classes) {
    const trimmed = String(c ?? "").trim().toUpperCase();
    if (trimmed) set.add(trimmed);
  }
  return Array.from(set);
}
