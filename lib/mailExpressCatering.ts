/**
 * Standard IRCTC catering charges for Mail, Express and Humsafar trains.
 * Sources (official IRCTC menu rate cards):
 *  - Beverages, Breakfast, Meals rate cards
 *  - À la carte tariff: menurates.irctc.co.in/PDFFiles/MenuandTariffforA-la-Carteitems.pdf
 * All prices are in INR and inclusive of taxes / GST.
 */

export type CateringItem = {
  item: string;
  /** Composition / quantity, verbatim-ish from the source. */
  desc?: string;
  veg: boolean;
  /** Two-column pricing (beverages, breakfast, meals). */
  atStation?: number | null;
  inTrain?: number | null;
  /** Single-column pricing (à la carte, inclusive of GST). */
  price?: number | null;
};

export type CateringSection = {
  title: string;
  note?: string;
  mode: "station-train" | "single";
  items: CateringItem[];
};

export type CateringBlock = {
  id: string;
  heading: string;
  sections: CateringSection[];
};

const V = true;
const NV = false;

export const CATERING_BLOCKS: CateringBlock[] = [
  {
    id: "beverages",
    heading: "Beverages",
    sections: [
      {
        title: "Tea & coffee",
        mode: "station-train",
        items: [
          { item: "Standard tea", desc: "150 ml, in a 170 ml disposable cup", veg: V, atStation: 5, inTrain: 5 },
          { item: "Tea with tea bag", desc: "150 ml, in a 170 ml disposable cup", veg: V, atStation: 10, inTrain: 10 },
          { item: "Coffee (instant coffee powder)", desc: "150 ml, in a 170 ml disposable cup", veg: V, atStation: 10, inTrain: 10 },
        ],
      },
      {
        title: "Humsafar trains (via AVM vending machine)",
        note: "Served on board only, not at stations.",
        mode: "station-train",
        items: [
          { item: "Tea, all variants without tea bag", desc: "100 ml, in a 120 ml cup", veg: V, atStation: null, inTrain: 10 },
          { item: "Coffee", desc: "100 ml, in a 120 ml cup", veg: V, atStation: null, inTrain: 15 },
          { item: "Soup", desc: "100 ml, in a 120 ml cup", veg: V, atStation: null, inTrain: 15 },
        ],
      },
      {
        title: "Rail Neer / packaged drinking water (chilled)",
        mode: "station-train",
        items: [
          { item: "1 litre bottle (1000 ml)", veg: V, atStation: 14, inTrain: 14 },
          { item: "500 ml bottle", veg: V, atStation: 9, inTrain: 9 },
        ],
      },
    ],
  },
  {
    id: "breakfast",
    heading: "Breakfast",
    sections: [
      {
        title: "Breakfast",
        mode: "station-train",
        items: [
          { item: "Veg breakfast (Cutlet)", desc: "Bread slice (2) 50 gms, veg cutlet (2) 100 gms, butter blister 8 gms, tomato ketchup sachet 12 gms, casserole, napkin, spoon", veg: V, atStation: 35, inTrain: 40 },
          { item: "Veg breakfast (Idli & Vada)", desc: "Idli (2) 100 gms, vada (2) 60 gms, chutney 50 gms, casserole, napkin, spoon", veg: V, atStation: 35, inTrain: 40 },
          { item: "Veg breakfast (Upma & Vada)", desc: "Upma 100 gms, vada (2) 60 gms, chutney 50 gms, casserole, napkin, spoon", veg: V, atStation: 35, inTrain: 40 },
          { item: "Veg breakfast (Pongal & Vada)", desc: "Pongal 100 gms, vada (2) 60 gms, chutney 50 gms, casserole, napkin, spoon", veg: V, atStation: 35, inTrain: 40 },
          { item: "Non-veg breakfast (Egg Omelette)", desc: "Bread slice (2) 50 gms, omelette / boiled eggs (2 eggs) 90 gms, butter 8 gms, ketchup 12 gms, salt & pepper sachets, casserole, napkin, spoon", veg: NV, atStation: 45, inTrain: 50 },
        ],
      },
    ],
  },
  {
    id: "meals",
    heading: "Meals",
    sections: [
      {
        title: "Meals",
        mode: "station-train",
        items: [
          { item: "Veg meal (standard casserole)", desc: "Plain rice 150 gms, 2 parathas / 4 chapatis 100 gms, dal / sambar (thick) 150 gms, mixed veg (seasonal) 100 gms, curd 80 gms, pickle 12 gms", veg: V, atStation: 70, inTrain: 80 },
          { item: "Non-veg meal (Egg Curry with Rice)", desc: "Plain rice 150 gms, 2 parathas / 4 chapatis, dal / sambar 150 gms, two-egg curry 150 gms, curd 80 gms, pickle", veg: NV, atStation: 80, inTrain: 90 },
          { item: "Non-veg meal (Chicken Curry with Rice)", desc: "Plain rice 150 gms, 2 parathas / 4 chapatis, dal / sambar 150 gms, chicken curry (60 gms boneless + 90 gms gravy), curd 80 gms, pickle", veg: NV, atStation: 120, inTrain: 130 },
          { item: "Veg biryani (350 gms)", desc: "Biryani 270 gms incl. 70 gms vegetables, 80 gms branded curd, 12 gms pickle, tissue, sanitizer", veg: V, atStation: 70, inTrain: 80 },
          { item: "Egg biryani (350 gms)", desc: "Biryani 270 gms incl. 2 eggs, 80 gms branded curd, 12 gms pickle, tissue, sanitizer", veg: NV, atStation: 80, inTrain: 90 },
          { item: "Chicken biryani (350 gms)", desc: "Biryani 270 gms incl. 70 gms boneless chicken, 80 gms branded curd, 12 gms pickle, tissue, sanitizer", veg: NV, atStation: 100, inTrain: 110 },
          { item: "Janta Meal", desc: "Pooris (7 nos) 175 gms, aloo dry curry 150 gms, pickle 15 gms", veg: V, atStation: 15, inTrain: 20 },
        ],
      },
    ],
  },
  {
    id: "a-la-carte",
    heading: "À la carte items",
    sections: [
      {
        title: "Veg items",
        mode: "single",
        items: [
          { item: "Chapati", desc: "2 chapati, 30 gms each", veg: V, price: 20 },
          { item: "Kachori", desc: "2 kachoris of 40 gms each + ketchup sachet", veg: V, price: 20 },
          { item: "Thatte Idly", desc: "100 gms idly + 40 gms chutney", veg: V, price: 20 },
          { item: "Idly with chutney / sambhar", desc: "2 nos of 30 gms each + 40 gms chutney / sambar", veg: V, price: 20 },
          { item: "Bread butter / toast butter", desc: "2 slices of bread + 8-10 gms butter chiplet", veg: V, price: 20 },
          { item: "Aloo Bonda / Sukhiyan / Kozhukatta / Sweet Bonda", desc: "2 nos of 50 gms each + ketchup sachet", veg: V, price: 20 },
          { item: "Samosa", desc: "2 nos 50 gms each + ketchup sachet", veg: V, price: 20 },
          { item: "Maddur Vada", desc: "2 no of 50 gms each + coconut chutney 15 gms", veg: V, price: 20 },
          { item: "Hot / cold milk with sugar", desc: "250 ml branded milk + 1 sugar sachet", veg: V, price: 20 },
          { item: "Masala / Dal / Medu Vada", desc: "2 nos of 40 gms each + 40 gms chutney", veg: V, price: 30 },
          { item: "Rava / Wheat / Oat / Semiya Upma", desc: "150 gms upma + 40 gms chutney / sambar", veg: V, price: 30 },
          { item: "Onion / Rava Uttapam", desc: "110 gms dosa / uttapam + 40 gms chutney", veg: V, price: 30 },
          { item: "Dahi Vada", desc: "2 nos of 30 gms each + 100 gms dahi", veg: V, price: 30 },
          { item: "Bread Pakora", desc: "80 gms of pakora + ketchup or 30 gms chutney", veg: V, price: 30 },
          { item: "Onion / Potato / Baigan / Assorted Pakora / Bhaji", desc: "100 gms of pakora + ketchup sachet", veg: V, price: 30 },
          { item: "Dhokla", desc: "100 gms of dhokla", veg: V, price: 30 },
          { item: "Poha", desc: "150 gms of poha with namkeen garnish", veg: V, price: 30 },
          { item: "Tomato / Veg / Chicken Soup", desc: "150 ml with 10 gms sachet of approved brand", veg: V, price: 30 },
          { item: "Gatta Sabji", desc: "250 gms gatta sabji", veg: V, price: 30 },
          { item: "Masala Dosa", desc: "70 gms dosa + 80 gms potato masala + 40 gms chutney + 100 gm sambar", veg: V, price: 50 },
          { item: "Tamarind / Lemon / Curd / Coconut Rice", desc: "350 gms rice + branded pickle sachet", veg: V, price: 50 },
          { item: "Paneer Pakora", desc: "2 paneer pakoda 60 gms each", veg: V, price: 50 },
          { item: "Veg Burger", desc: "35 gms bun + 75 gms cooked patty + onion-tomato slice + ketchup", veg: V, price: 50 },
          { item: "Rajma / Chole Chawal", desc: "150 gm rajmah / chole + 200 gms rice", veg: V, price: 50 },
          { item: "Cheese Sandwich", desc: "2 pieces of cheese sandwich, 60 gms", veg: V, price: 50 },
          { item: "Veg Noodles", desc: "300 gms of veg noodles + ketchup sachet", veg: V, price: 50 },
          { item: "Pav Bhaji", desc: "2 nos of pav (30 gms) + 200 gms bhaji", veg: V, price: 50 },
          { item: "Dal Bati Churma", desc: "250 gms dal bati churma + 30 gms lehsun chutney", veg: V, price: 100 },
        ],
      },
      {
        title: "Non-veg items",
        mode: "single",
        items: [
          { item: "Boiled Egg", desc: "2 eggs", veg: NV, price: 30 },
          { item: "Chicken Sandwich", desc: "2 pieces of chicken sandwich, 60 gms", veg: NV, price: 50 },
          { item: "Egg Fried Rice / noodles", desc: "350 gms of egg fried rice (basmati) / noodles", veg: NV, price: 90 },
          { item: "Fish Cutlet", desc: "2 pieces of fish cutlet 50 gms + 20 gms finger chips + ketchup", veg: NV, price: 100 },
          { item: "Fish Curry / fry", desc: "2 pieces of fish (100 gms) + 100 gms curry", veg: NV, price: 100 },
          { item: "Chicken Fried Rice / noodles", desc: "350 gms of chicken fried rice (basmati) / noodles", veg: NV, price: 100 },
        ],
      },
      {
        title: "Sweets",
        mode: "single",
        items: [
          { item: "Jalebi", desc: "60 gms of jalebi", veg: V, price: 20 },
          { item: "Gulab Jamun", desc: "30 gms of gulab jamun", veg: V, price: 20 },
          { item: "Kesari Bhath", desc: "100 gms of kesari bhath", veg: V, price: 20 },
        ],
      },
      {
        title: "Diabetic items",
        mode: "single",
        items: [
          { item: "Boiled Vegetables", desc: "100 gms", veg: V, price: 30 },
          { item: "Oats (branded) with milk", desc: "30 gms of oats + 150 ml milk", veg: V, price: 40 },
          { item: "Corn flakes with milk", desc: "30 gms of branded corn flakes + 150 ml milk", veg: V, price: 40 },
          { item: "Egg white omelette with whole wheat bread", desc: "2 egg-white omelette with 2 slices of whole wheat bread", veg: NV, price: 50 },
        ],
      },
      {
        title: "Regional items (recommended by zones)",
        mode: "single",
        items: [
          { item: "Veg Patties", desc: "Stuffed veg patties 100 gms + ketchup sachet", veg: V, price: 30 },
          { item: "Pyaz Kachori", desc: "1 no of 50 gms each + ketchup sachet", veg: V, price: 30 },
          { item: "Vada Pav", desc: "2 nos vada 30 gms each + 2 nos pav 15-20 gms each + ketchup + green chilli", veg: V, price: 30 },
          { item: "Bhel Puri / Jhaal Murhi", desc: "100 gm bhel puri / jhaal murhi", veg: V, price: 30 },
          { item: "Pastry", desc: "1 no of 100 gms", veg: V, price: 40 },
          { item: "Palam Puri", desc: "2 pcs of palam puri 50 gms each", veg: V, price: 40 },
          { item: "Pav Ghugani", desc: "2 pcs of pav 30 gms each + ghugani 200 gms", veg: V, price: 40 },
          { item: "Aloo Chop", desc: "2 pieces 50 gms each + 100 gms ghugani", veg: V, price: 40 },
          { item: "Veg Momo", desc: "8 nos of 20 gms each + chutney", veg: V, price: 50 },
          { item: "Litti Chokha", desc: "4 pcs of stuffed litti 50 gms each + chokha 100 gms", veg: V, price: 50 },
          { item: "Khichdi", desc: "350 gm khichdi + 30 gm chutney + pickle sachet", veg: V, price: 50 },
          { item: "Rice Dalma", desc: "200 gm rice + 150 gm dalma + 30 gm tomato chutney", veg: V, price: 50 },
          { item: "Chicken Momo", desc: "8 nos of 20 gms each + chutney", veg: NV, price: 80 },
          { item: "Spring Roll", desc: "2 nos of 60 gms each + ketchup sachet", veg: V, price: 80 },
        ],
      },
      {
        title: "Ragi items",
        mode: "single",
        items: [
          { item: "Ragi Ladoo", desc: "2 nos of branded packed sweet ragi laddoo", veg: V, price: 30 },
          { item: "Ragi Kachori", desc: "2 kachoris of 40 gms each + ketchup sachet", veg: V, price: 30 },
          { item: "Ragi Idli", desc: "2 nos ragi idli (100 gms) + 40 gms coconut chutney", veg: V, price: 40 },
          { item: "Ragi Dosa (Masala)", desc: "100 gms dosa + mint / onion-tomato chutney 80 gms", veg: V, price: 40 },
          { item: "Ragi Uttapam", desc: "100 gms uttapam + mint / onion-tomato chutney 80 gms", veg: V, price: 40 },
          { item: "Ragi Thepla", desc: "2 nos ragi thepla (100 gms) + curd 80 gms + chutney + pickle", veg: V, price: 40 },
          { item: "Ragi Paratha", desc: "2 nos ragi paratha (100 gms) + curd 80 gms + chutney + pickle", veg: V, price: 40 },
          { item: "Ragi Upma", desc: "ragi upma 100 gms + coconut chutney 50 gms + sev 25 gms", veg: V, price: 50 },
        ],
      },
    ],
  },
];
