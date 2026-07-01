/**
 * Maps a dish name/description to a food emoji + a soft gradient for the
 * thumbnail tile. Pure and client-safe, shared across the food-menu pages.
 */
export function dishVisual(text: string): { emoji: string; bg: string } {
  const t = text.toLowerCase();
  const pick = (emoji: string, bg: string) => ({ emoji, bg });
  if (/water|rail neer/.test(t)) return pick("💧", "from-sky-100 to-sky-50");
  if (/tea|coffee|beverage/.test(t)) return pick("☕", "from-amber-100 to-orange-50");
  if (/juice|lassi|milk|chaas|nimbu|shake|drink/.test(t)) return pick("🥤", "from-rose-100 to-amber-50");
  if (/soup/.test(t)) return pick("🍜", "from-orange-100 to-amber-50");
  if (/biryani|pulao|rice/.test(t)) return pick("🍛", "from-amber-100 to-yellow-50");
  if (/dal|sambar|sambhar|rajma|chole|kadhi|dalma|ghugani/.test(t)) return pick("🥣", "from-orange-100 to-amber-50");
  if (/paneer|kofta|tikka|masala|curry|sabji|bhaji|korma|special|main course/.test(t)) return pick("🍲", "from-red-100 to-orange-50");
  if (/chicken/.test(t)) return pick("🍗", "from-red-100 to-amber-50");
  if (/fish/.test(t)) return pick("🐟", "from-cyan-100 to-sky-50");
  if (/egg|omelette|omlette/.test(t)) return pick("🍳", "from-amber-100 to-yellow-50");
  if (/paratha|parantha|roti|chapati|kulcha|naan|bread|thepla|poori|puri|litti/.test(t)) return pick("🫓", "from-amber-100 to-orange-50");
  if (/idli|idly|dosa|uttapam|utappam|vada|upma|pongal|poha|dhokla/.test(t)) return pick("🥞", "from-yellow-100 to-amber-50");
  if (/samosa|kachori|pakora|bonda|patties|momo|spring roll|cutlet|hot snack|namkeen/.test(t)) return pick("🥟", "from-orange-100 to-yellow-50");
  if (/sandwich|burger|pav|bun/.test(t)) return pick("🥪", "from-lime-100 to-amber-50");
  if (/popcorn/.test(t)) return pick("🍿", "from-yellow-100 to-amber-50");
  if (/cake|muffin|cookie|biscuit|pastry|croissant/.test(t)) return pick("🧁", "from-pink-100 to-rose-50");
  if (/ice ?cream|halwa|jalebi|gulab|kesari|sweet|dessert|mishti|dahi|curd|srikhand|sheera|matho/.test(t)) return pick("🍨", "from-pink-100 to-amber-50");
  if (/fruit|banana|apple|orange/.test(t)) return pick("🍎", "from-rose-100 to-lime-50");
  if (/cereal|corn ?flakes|oats|muesli/.test(t)) return pick("🥣", "from-amber-100 to-yellow-50");
  if (/pickle|condiment|salt|pepper|ketchup|sauce/.test(t)) return pick("🧂", "from-slate-100 to-slate-50");
  if (/vegetable|veg\.?|salad/.test(t)) return pick("🥗", "from-lime-100 to-green-50");
  return pick("🍽️", "from-slate-100 to-slate-50");
}
