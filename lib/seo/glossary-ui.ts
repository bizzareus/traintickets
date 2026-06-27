/** Small set of UI strings for the glossary pages, per language (chrome only). */
type GlossaryUiStrings = {
  title: string;
  subtitle: string;
  related: string;
  crumb: string;
  language: string;
};

export const GLOSSARY_UI: Record<string, GlossaryUiStrings> = {
  en: {
    title: "Indian Railway Glossary",
    subtitle:
      "Plain-English meanings for the booking codes, waiting-list types and IRCTC terms you run into when booking train tickets.",
    related: "Related Terms",
    crumb: "Glossary",
    language: "Language:",
  },
  hi: {
    title: "भारतीय रेलवे शब्दावली",
    subtitle:
      "ट्रेन टिकट बुक करते समय मिलने वाले बुकिंग कोड, वेटिंग लिस्ट के प्रकार और IRCTC शब्दों के आसान अर्थ।",
    related: "संबंधित शब्द",
    crumb: "शब्दावली",
    language: "भाषा:",
  },
  mr: {
    title: "भारतीय रेल्वे शब्दकोश",
    subtitle:
      "ट्रेन तिकीट बुक करताना भेटणारे बुकिंग कोड, वेटिंग लिस्टचे प्रकार आणि IRCTC संज्ञांचे सोपे अर्थ.",
    related: "संबंधित संज्ञा",
    crumb: "शब्दकोश",
    language: "भाषा:",
  },
  bn: {
    title: "ভারতীয় রেলওয়ে শব্দকোষ",
    subtitle:
      "ট্রেনের টিকিট বুক করার সময় যে বুকিং কোড, ওয়েটিং লিস্টের ধরন এবং IRCTC শব্দগুলি পাওয়া যায় তার সহজ অর্থ।",
    related: "সম্পর্কিত শব্দ",
    crumb: "শব্দকোষ",
    language: "ভাষা:",
  },
  ta: {
    title: "இந்திய ரயில்வே சொற்களஞ்சியம்",
    subtitle:
      "ரயில் டிக்கெட் முன்பதிவு செய்யும்போது வரும் முன்பதிவு குறியீடுகள், காத்திருப்புப் பட்டியல் வகைகள் மற்றும் IRCTC சொற்களின் எளிய பொருள்.",
    related: "தொடர்புடைய சொற்கள்",
    crumb: "சொற்களஞ்சியம்",
    language: "மொழி:",
  },
  te: {
    title: "భారతీయ రైల్వే పదకోశం",
    subtitle:
      "రైలు టికెట్లు బుక్ చేసేటప్పుడు ఎదురయ్యే బుకింగ్ కోడ్లు, వెయిటింగ్ లిస్ట్ రకాలు మరియు IRCTC పదాల సరళమైన అర్థాలు.",
    related: "సంబంధిత పదాలు",
    crumb: "పదకోశం",
    language: "భాష:",
  },
  ml: {
    title: "ഇന്ത്യൻ റെയിൽവേ പദകോശം",
    subtitle:
      "ട്രെയിൻ ടിക്കറ്റ് ബുക്ക് ചെയ്യുമ്പോൾ കാണുന്ന ബുക്കിംഗ് കോഡുകൾ, വെയിറ്റിംഗ് ലിസ്റ്റ് തരങ്ങൾ, IRCTC പദങ്ങൾ എന്നിവയുടെ ലളിതമായ അർത്ഥങ്ങൾ.",
    related: "ബന്ധപ്പെട്ട പദങ്ങൾ",
    crumb: "പദകോശം",
    language: "ഭാഷ:",
  },
};

export function glossaryUi(lang: string): GlossaryUiStrings {
  return GLOSSARY_UI[lang] ?? GLOSSARY_UI.en;
}
