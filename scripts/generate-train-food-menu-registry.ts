import * as fs from "fs";
import * as path from "path";
import { buildFoodMenuSlug } from "../lib/foodMenuSlug";

const CUSTOM_DIR = path.join(__dirname, "../content/irctc-train-food-menu");
const TRAINLIST_PATH = path.join(__dirname, "../backend/prisma/trainlist.txt");
const OUT_FILE = path.join(__dirname, "../content/train-food-menu-registry.json");

export type TrainType =
  | "vande-bharat"
  | "tejas"
  | "gatimaan"
  | "rajdhani"
  | "shatabdi"
  | "duronto"
  | "garib-rath"
  | "humsafar"
  | "jan-shatabdi"
  | "ac-express"
  | "mail-express";

export type TrainZone = "North" | "South" | "East" | "West" | "South Central";

export type TrainRegistryEntry = {
  trainNumber: string;
  trainNumberPair: string;
  trainName: string;
  label: string;
  route: string;
  slug: string;
  trainType: TrainType;
  zone: TrainZone;
  status: "done" | "mapped";
  hasCustomMenu: boolean;
  menuKey: string;
};

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function cleanTrainName(rawName: string): string {
  let name = rawName
    .replace(/\s+/g, " ")
    .replace(/\bEXP\b/gi, "Express")
    .replace(/\bSF\b/gi, "Superfast")
    .replace(/\bSPL\b/gi, "Special")
    .replace(/\bEX\b/gi, "Express")
    .replace(/\bS F\b/gi, "Superfast")
    .trim();

  // Normalize capitalization
  name = titleCase(name);

  // Fix common acronyms
  name = name
    .replace(/\bVb\b/g, "Vande Bharat")
    .replace(/\bSf\b/g, "SF")
    .replace(/\bAc\b/g, "AC")
    .replace(/\bTod\b/g, "TOD");

  return name;
}

function detectTrainType(name: string): TrainType {
  const upper = name.toUpperCase();
  if (upper.includes("VANDE") || upper.includes("VB") || upper.includes("V.B.")) return "vande-bharat";
  if (upper.includes("TEJAS")) return "tejas";
  if (upper.includes("GATIMAAN") || upper.includes("GATIMAN")) return "gatimaan";
  if (upper.includes("RAJDHANI")) return "rajdhani";
  if (upper.includes("SHATABDI") && !upper.includes("JAN")) return "shatabdi";
  if (upper.includes("DURONTO")) return "duronto";
  if (upper.includes("GARIB RATH") || upper.includes("GARIBRATH") || upper.includes("GR ")) return "garib-rath";
  if (upper.includes("HUMSAFAR")) return "humsafar";
  if (upper.includes("JAN SHATABDI") || upper.includes("JANSHATABDI")) return "jan-shatabdi";
  if (
    upper.includes("AC EXP") ||
    upper.includes("AC SF") ||
    upper.includes("AC EXPRESS") ||
    upper.includes("AC SPECIAL") ||
    upper.includes("DOUBLE DECKER")
  ) {
    return "ac-express";
  }
  return "mail-express";
}

function detectZone(trainNo: string, name: string): TrainZone {
  const upper = name.toUpperCase();

  // Keyword match on cities / regions
  if (
    upper.includes("DELHI") ||
    upper.includes("NDLS") ||
    upper.includes("NZM") ||
    upper.includes("JAMMU") ||
    upper.includes("PUNJAB") ||
    upper.includes("CHANDIGARH") ||
    upper.includes("KALKA") ||
    upper.includes("DEHRADUN") ||
    upper.includes("AMRITSAR") ||
    upper.includes("LUCKNOW") ||
    upper.includes("VARANASI") ||
    upper.includes("JAIPUR") ||
    upper.includes("HARIDWAR") ||
    upper.includes("AGRA") ||
    upper.includes("KANPUR") ||
    upper.includes("GORAKHPUR") ||
    upper.includes("NORTH")
  ) {
    return "North";
  }

  if (
    upper.includes("CHENNAI") ||
    upper.includes("MAS") ||
    upper.includes("BANGALORE") ||
    upper.includes("BENGALURU") ||
    upper.includes("SBC") ||
    upper.includes("BNC") ||
    upper.includes("KERALA") ||
    upper.includes("TRIVANDRUM") ||
    upper.includes("TVC") ||
    upper.includes("COIMBATORE") ||
    upper.includes("CBE") ||
    upper.includes("MYSORE") ||
    upper.includes("MYS") ||
    upper.includes("MADURAI") ||
    upper.includes("MDU") ||
    upper.includes("KOCHI") ||
    upper.includes("ERNAKULAM") ||
    upper.includes("ERS") ||
    upper.includes("TIRUNELVELI") ||
    upper.includes("TEN") ||
    upper.includes("MANGALORE") ||
    upper.includes("MAQ") ||
    upper.includes("SOUTH")
  ) {
    return "South";
  }

  if (
    upper.includes("HOWRAH") ||
    upper.includes("HWH") ||
    upper.includes("SEALDAH") ||
    upper.includes("SDAH") ||
    upper.includes("KOLKATA") ||
    upper.includes("PATNA") ||
    upper.includes("PNBE") ||
    upper.includes("GUWAHATI") ||
    upper.includes("GHY") ||
    upper.includes("ASSAM") ||
    upper.includes("PURI") ||
    upper.includes("BHUBANESWAR") ||
    upper.includes("BBS") ||
    upper.includes("RANCHI") ||
    upper.includes("RNC") ||
    upper.includes("GAYA") ||
    upper.includes("EAST")
  ) {
    return "East";
  }

  if (
    upper.includes("MUMBAI") ||
    upper.includes("MMCT") ||
    upper.includes("CSMT") ||
    upper.includes("BOMBAY") ||
    upper.includes("GUJARAT") ||
    upper.includes("AHMEDABAD") ||
    upper.includes("ADI") ||
    upper.includes("PUNE") ||
    upper.includes("GOA") ||
    upper.includes("MAO") ||
    upper.includes("SURAT") ||
    upper.includes("INDORE") ||
    upper.includes("INDB") ||
    upper.includes("BHOPAL") ||
    upper.includes("RKMP") ||
    upper.includes("VADODARA") ||
    upper.includes("WEST")
  ) {
    return "West";
  }

  if (
    upper.includes("HYDERABAD") ||
    upper.includes("HYB") ||
    upper.includes("SECUNDERABAD") ||
    upper.includes("SC") ||
    upper.includes("KACHEGUDA") ||
    upper.includes("KCG") ||
    upper.includes("VIJAYAWADA") ||
    upper.includes("BZA") ||
    upper.includes("VISAKHAPATNAM") ||
    upper.includes("VSKP") ||
    upper.includes("TIRUPATI") ||
    upper.includes("TPTY")
  ) {
    return "South Central";
  }

  // Fallback based on 2nd digit of train number
  const d2 = trainNo.length >= 2 ? trainNo.charAt(1) : "";
  if (["3", "4"].includes(d2)) return "North";
  if (["5"].includes(d2)) return "South";
  if (["6"].includes(d2)) return "South Central";
  if (["2", "7"].includes(d2)) return "East";
  if (["8", "9", "1", "0"].includes(d2)) return "West";

  return "North";
}

function generateRegistry(): TrainRegistryEntry[] {
  // 1. Read existing custom files
  const customMap = new Map<
    string,
    {
      slug: string;
      trainNumber: string;
      trainNumberPair: string;
      trainName: string;
      route: string;
    }
  >();

  if (fs.existsSync(CUSTOM_DIR)) {
    for (const f of fs.readdirSync(CUSTOM_DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(CUSTOM_DIR, f), "utf8"),
        );
        const slug = data.slug || f.replace(/\.json$/, "");
        customMap.set(data.trainNumber, {
          slug,
          trainNumber: data.trainNumber,
          trainNumberPair: data.trainNumberPair || data.trainNumber,
          trainName: data.trainName,
          route: data.route || "",
        });
      } catch {
        /* skip invalid */
      }
    }
  }

  // 2. Read trainlist.txt
  const entries: TrainRegistryEntry[] = [];
  const seenNumbers = new Set<string>();

  if (fs.existsSync(TRAINLIST_PATH)) {
    const raw = fs.readFileSync(TRAINLIST_PATH, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^"|",?$/g, "").trim())
      .filter(Boolean);

    for (const line of lines) {
      const trainNumber = line.includes(" - ")
        ? line.split(" - ")[0].trim()
        : line.trim();
      const rawTrainName = line.includes(" - ")
        ? line.split(" - ")[1].trim()
        : "";

      if (!trainNumber || seenNumbers.has(trainNumber)) continue;
      seenNumbers.add(trainNumber);

      const custom = customMap.get(trainNumber);
      if (custom) {
        const trainType = detectTrainType(custom.trainName);
        const zone = detectZone(trainNumber, custom.trainName);
        entries.push({
          trainNumber,
          trainNumberPair: custom.trainNumberPair,
          trainName: custom.trainName,
          label: line,
          route: custom.route,
          slug: custom.slug,
          trainType,
          zone,
          status: "done",
          hasCustomMenu: true,
          menuKey: "custom",
        });
      } else {
        const cleanedName = cleanTrainName(rawTrainName || trainNumber);
        const trainType = detectTrainType(rawTrainName);
        const zone = detectZone(trainNumber, rawTrainName);
        const slug = buildFoodMenuSlug(cleanedName, trainNumber);
        const menuKey = `${trainType}-${zone.toLowerCase().replace(/\s+/g, "-")}`;

        entries.push({
          trainNumber,
          trainNumberPair: trainNumber,
          trainName: cleanedName,
          label: line,
          route: "",
          slug,
          trainType,
          zone,
          status: "mapped",
          hasCustomMenu: false,
          menuKey,
        });
      }
    }
  }

  // 3. Add any custom trains not in trainlist.txt
  for (const [trainNo, custom] of customMap.entries()) {
    if (!seenNumbers.has(trainNo)) {
      seenNumbers.add(trainNo);
      const trainType = detectTrainType(custom.trainName);
      const zone = detectZone(trainNo, custom.trainName);
      entries.push({
        trainNumber: trainNo,
        trainNumberPair: custom.trainNumberPair,
        trainName: custom.trainName,
        label: `${trainNo} - ${custom.trainName}`,
        route: custom.route,
        slug: custom.slug,
        trainType,
        zone,
        status: "done",
        hasCustomMenu: true,
        menuKey: "custom",
      });
    }
  }

  // Sort by train number
  entries.sort((a, b) => a.trainNumber.localeCompare(b.trainNumber, undefined, { numeric: true }));
  return entries;
}

const registry = generateRegistry();
fs.writeFileSync(OUT_FILE, JSON.stringify(registry, null, 2) + "\n");
console.log(
  `Generated train food menu registry with ${registry.length} trains (${registry.filter((r) => r.status === "done").length} custom, ${registry.filter((r) => r.status === "mapped").length} mapped). Output: ${OUT_FILE}`,
);
