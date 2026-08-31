import type {
  FoodMenuClass,
  FoodMenuService,
  TrainFoodMenu,
} from "@/lib/trainFoodMenu";

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

// Regional cyclic meal descriptions based on zone
const ZONE_MEALS: Record<
  TrainZone,
  {
    breakfastVeg: string;
    breakfastNonVeg: string;
    rice: string;
    bread: string;
    dal: string;
    mainVeg: string;
    mainNonVeg: string;
    dryVeg: string;
    dessert: string;
    snacks: string;
  }
> = {
  North: {
    breakfastVeg:
      "served on cyclic rotation: (1) 2 Paneer Cutlets + 2 Brown Bread slices + Butter chiplet + Jam; (2) 4 Bedmi Pooris + Aloo Subzi + Pickle; (3) 2 Bhature + Chole Masala + Pickle; (4) 2 Stuffed Aloo/Gobhi Parathas + Branded Curd + Pickle; (5) Veg Besan Chilla + Curd + Ketchup.",
    breakfastNonVeg:
      "served on cyclic rotation: 2-Egg Masala Omelette or Boiled Eggs (2) + Boiled Veg (Carrots, Beans, Peas) + 2 Brown Bread slices + Butter chiplet + Tomato Ketchup.",
    rice: "served on cyclic rotation: (1) Veg Pulao (Basmati Rice); (2) Jeera Rice; (3) Kashmiri Pulao; (4) Peas Pulao; (5) Steamed Basmati Rice.",
    bread:
      "served on cyclic rotation: (1) 2 Tehdar Parathas; (2) 3 Tawa Rotis; (3) 2 Tikona Parathas; (4) 3 Roomali Rotis; (5) 2 Wheat-Ragi Parathas.",
    dal: "served on cyclic rotation: (1) Panchratani Dal; (2) Dal Rajma; (3) Dal Makhani; (4) Dal Tadka; (5) Dal Chana / Chola.",
    mainVeg:
      "served on cyclic rotation: (1) Kadhai Paneer; (2) Mattar Paneer; (3) Paneer Butter Masala; (4) Paneer Do Pyaza; (5) Paneer Kofta in Rich Gravy.",
    mainNonVeg:
      "served on cyclic rotation: (1) Kadhai Chicken (boneless); (2) Chicken Curry (boneless); (3) Methi Chicken (boneless); (4) Chicken Do Pyaza (boneless); (5) Ginger Chicken Masala (boneless).",
    dryVeg:
      "served on cyclic rotation: Aloo Gobhi Adraki, Bhindi Do Pyaza, Mix Seasonal Veg, Beans Aloo Poriyal.",
    dessert:
      "served on cyclic rotation: Premium Ice Cream (Butterscotch / Kaju Pista / Vanilla) OR Branded Sweet (Gulab Jamun / Sandesh / Rasgulla / Milk Cake / Ragi Laddu).",
    snacks:
      "served on cyclic rotation: Butter Veg Sandwich + Samosa / Dal Kachori / Pyaz Kachori / Matar Samosa + Branded Indian Sweet (Coconut Barfi / Mysore Pak / Besan Laddu / Chikki) + Namkeen Packet + Ketchup.",
  },
  South: {
    breakfastVeg:
      "served on cyclic rotation: (1) 2 Idlis + 1 Medu Vada + Sambar & Coconut Chutney + Kesari Bath; (2) Ghee Pongal + 1 Medu Vada + Sambar & Chutney + Pineapple Kesari; (3) Rava Kitchdi + Medu Vada + Sambar & Chutney; (4) Lemon Seva Upma + Medu Vada + Kesari; (5) 2 Masala Dosas + Sambar & Chutney.",
    breakfastNonVeg:
      "served on cyclic rotation: 2-Egg Masala Omelette or Muttai Poriyal + 2 Veg Cutlets + 2 slices Brown Bread + Butter chiplet + Jam.",
    rice: "served on cyclic rotation: (1) Steamed Ponni Rice; (2) Ghee Rice (Seeraga Samba); (3) Bisibele Bath; (4) Tamarind / Lemon / Tomato Rice; (5) Vegetable Birinji.",
    bread:
      "served on cyclic rotation: (1) 2 Malabar Wheat Parottas; (2) 2 Soft Chapathis; (3) 2 Wheat Parottas; (4) 3 Phulkas.",
    dal: "served on cyclic rotation: (1) Tomato Paruppu Kootu; (2) Chowchow Kootu; (3) Sorekai Thovve; (4) Peerkkangai Paruppu Kootu; (5) Drumstick Sambar.",
    mainVeg:
      "served on cyclic rotation: (1) Chettinad Vegetable Curry; (2) Kadhamba Kaikari Kurma; (3) Soya Pattani Curry; (4) Paruppu Urundai Kozhambu; (5) Paneer Butter Masala.",
    mainNonVeg:
      "served on cyclic rotation: (1) Chettinad Kozhi Curry (boneless); (2) Pallipalayam Chicken Curry (boneless); (3) Kozhi Varutha Kozhambu (boneless); (4) Koli Saaru (boneless); (5) Andhra Style Chicken Curry.",
    dryVeg:
      "served on cyclic rotation: Vazhakkai Varuval, Cabbage Carrot Poriyal, Kovaikkai Varuval, Beetroot Kothavarangai Poriyal.",
    dessert:
      "served on cyclic rotation: Mysore Pak, Ragi Laddu, Payasam, Kambu Laddu, or Branded Ice Cream.",
    snacks:
      "served on cyclic rotation: Mysore Bonda / Keera Vadai / Masala Vadai / Garam Pakkoda + Branded Kadalai Mittai / Ellu Urundai / Sweet Boli (Holige) + Kai Murukku / Madras Mixture.",
  },
  East: {
    breakfastVeg:
      "served on cyclic rotation: (1) 4 Luchis + Aloo Dum + Pickle + Sweet; (2) 2 Veg Cutlets + 2 Brown Bread slices + Butter chiplet; (3) 2 Radhaballavi + Chholar Dal + Pickle; (4) 2 Stuffed Sattu Parathas + Chokha + Curd; (5) 2 Koraishutir Kochuri + Aloo Tarkari.",
    breakfastNonVeg:
      "served on cyclic rotation: 2-Egg Masala Omelette or Dimer Devil + 2 slices Brown Bread + Butter chiplet + Tomato Ketchup.",
    rice: "served on cyclic rotation: (1) Steamed Gobindobhog Rice; (2) Basmati Jeera Rice; (3) Veg Pulao (Bengali Style); (4) Peas Pulao; (5) Plain Basmati Rice.",
    bread:
      "served on cyclic rotation: (1) 3 Tawa Rotis; (2) 2 Soft Parathas; (3) 4 Luchis; (4) 2 Sattu Parathas.",
    dal: "served on cyclic rotation: (1) Chholar Dal with Coconut; (2) Moong Dal Tadka; (3) Musur Dal with Kalo Jeere; (4) Panchmel Dal; (5) Rajma Dal.",
    mainVeg:
      "served on cyclic rotation: (1) Chanar Dalna (Paneer Kofta); (2) Dhokar Dalna; (3) Paneer Butter Masala; (4) Navratan Korma; (5) Aloo Potol Rosha.",
    mainNonVeg:
      "served on cyclic rotation: (1) Machher Kalia / Fish Curry (boneless 100g); (2) Bengali Murgir Jhol (boneless); (3) Chicken Korma (boneless); (4) Mustard Fish Curry; (5) Chicken Do Pyaza.",
    dryVeg:
      "served on cyclic rotation: Aloo Posto, Potol Bhaja, Seasonal Mix Veg Bhaja, Beans Carrot Chorchori.",
    dessert:
      "served on cyclic rotation: Mishti Doi, Sandesh (2 pcs), Rosogolla (2 pcs), Chhena Poda, or Flavoured Ice Cream.",
    snacks:
      "served on cyclic rotation: Veg Singara (Bengali Samosa) / Radhaballavi + Butter Veg Sandwich + Darjeeling Tea / Coffee + Sandesh / Rasgulla + Jhaal Muri / Chanachur.",
  },
  West: {
    breakfastVeg:
      "served on cyclic rotation: (1) Poha with Sev & Lemon + 2 Dhokla pieces + Chutney; (2) 2 Methi Theplas + Branded Curd + Chhundo / Pickle; (3) 2 Veg Cutlets + 2 slices Brown Bread + Butter chiplet; (4) Pav Bhaji (2 Pavs + 150g Bhaji); (5) Upma + Coconut Chutney + Sheera.",
    breakfastNonVeg:
      "served on cyclic rotation: 2-Egg Bhurji / Masala Omelette + 2 Brown Bread slices + Butter chiplet + Tomato Ketchup.",
    rice: "served on cyclic rotation: (1) Veg Jeera Pulao; (2) Steamed Kolam Rice; (3) Masale Bhaat; (4) Peas Pulao; (5) Veg Biryani Rice.",
    bread:
      "served on cyclic rotation: (1) 3 Soft Rotis / Chapathis; (2) 2 Theplas; (3) 2 Multi-grain Parathas; (4) 2 Bhakris.",
    dal: "served on cyclic rotation: (1) Gujarati Khatti Meethi Dal; (2) Dal Tadka; (3) Varan / Toor Dal; (4) Dal Fry; (5) Moong Dal.",
    mainVeg:
      "served on cyclic rotation: (1) Veg Kolhapuri; (2) Paneer Makhanwala; (3) Sev Tameta Nu Shaak; (4) Undhiyu (Seasonal) / Paneer Kadai; (5) Malai Kofta.",
    mainNonVeg:
      "served on cyclic rotation: (1) Kolhapuri Chicken Curry (boneless); (2) Chicken Tikka Masala (boneless); (3) Saoji Chicken Curry; (4) Malvani Fish Curry; (5) Chicken Handi.",
    dryVeg:
      "served on cyclic rotation: Aloo Methi, Bhindi Masala, Kobi Batata Nu Shaak, Baingan Bharta.",
    dessert:
      "served on cyclic rotation: Branded Shrikhand (Kesar Elaichi / Mango), Basundi, Gulab Jamun, or Premium Ice Cream.",
    snacks:
      "served on cyclic rotation: Khaman Dhokla / Vada Pav / Veg Puff + Butter Veg Sandwich + Branded Shrikhand / Chikki + Gujarati Farsan Mixture + Tea / Coffee.",
  },
  "South Central": {
    breakfastVeg:
      "served on cyclic rotation: (1) 2 Idlis + 1 Medu Vada + Sambar & Peanut/Coconut Chutney; (2) MLA Pesarattu with Upma + Ginger Chutney; (3) 2 Veg Cutlets + 2 slices Brown Bread + Butter chiplet; (4) Upma + Medu Vada + Chutney; (5) 2 Masala Dosas + Sambar & Allam Chutney.",
    breakfastNonVeg:
      "served on cyclic rotation: 2-Egg Masala Omelette + 2 slices Brown Bread + Butter chiplet + Tomato Ketchup.",
    rice: "served on cyclic rotation: (1) Hyderabadi Veg Biryani Rice; (2) Steamed Sona Masoori Rice; (3) Bagara Rice; (4) Jeera Rice; (5) Curd Rice with Tadka.",
    bread:
      "served on cyclic rotation: (1) 2 Soft Parathas; (2) 3 Pulkas; (3) 2 Malabar Parottas; (4) 3 Chapathis.",
    dal: "served on cyclic rotation: (1) Tomato Pappu; (2) Palakura Pappu (Spinach Dal); (3) Dosakaya Pappu; (4) Dal Tadka; (5) Sambar.",
    mainVeg:
      "served on cyclic rotation: (1) Nizami Veg Handi; (2) Paneer Butter Masala; (3) Gongura Paneer Curry; (4) Gutti Vankaya Kura (Stuffed Brinjal); (5) Veg Korma.",
    mainNonVeg:
      "served on cyclic rotation: (1) Hyderabadi Chicken Curry (boneless); (2) Andhra Kodi Kura; (3) Gongura Chicken Curry (boneless); (4) Chicken Chettinad; (5) Pepper Chicken Gravy.",
    dryVeg:
      "served on cyclic rotation: Bendakaya Vepudu (Okra Fry), Dondakaya Vepudu, Aloo Beans Vepudu, Cabbage Poriyal.",
    dessert:
      "served on cyclic rotation: Double Ka Meetha, Qubani Ka Meetha, Gulab Jamun, Mysore Pak, or Branded Ice Cream.",
    snacks:
      "served on cyclic rotation: Mirchi Bajji / Punugulu / Onion Samosa + Veg Sandwich + Hyderabadi Osmania Biscuits + Chai / Coffee + Sweet.",
  },
};

/** Build classes for Rajdhani Express (1A Luxury + 2A/3A Standard). */
function buildRajdhaniClasses(zone: TrainZone): FoodMenuClass[] {
  const m = ZONE_MEALS[zone];
  return [
    {
      classCode: "1A",
      className: "First AC (1A)",
      services: [
        {
          service: "Morning Tea",
          price: 35,
          items: [
            {
              item: "Hot Beverage",
              description:
                "Choice of Branded Premix Tea, Coffee, Green Tea, Lemon Tea with Dairy Creamer, Sugar / Sugar-free sachets.",
            },
            {
              item: "Biscuits",
              description:
                "Branded Digestive Cookies / Marie Biscuits (2 Pcs).",
            },
            {
              item: "Sanitary Kit",
              description:
                "Good quality paper napkin tissue, Sanitizer sachet, Stirrer.",
            },
          ],
        },
        {
          service: "Breakfast",
          price: 140,
          items: [
            {
              item: "Cereal / Fruit",
              description:
                "Branded Corn Flakes / Muesli / Oats with Hot/Cold Milk, plus Fresh Banana / Apple or Branded Tetra Pack Fruit Juice.",
            },
            { item: "Vegetarian Option", description: m.breakfastVeg },
            { item: "Non-Vegetarian Option", description: m.breakfastNonVeg },
            {
              item: "Bakery & Beverage",
              description:
                "Branded Eggless Muffin / Fruit Cake + Choice of Tea / Coffee / Green Tea with Dairy Creamer & Sugar.",
            },
          ],
        },
        {
          service: "Lunch/Dinner",
          price: 245,
          items: [
            {
              item: "Soup Course",
              description:
                "Branded Hot Veg / Sweet Corn / Tomato Soup with Soup Sticks (2 Pcs), Dinner Roll & Butter chiplet.",
            },
            { item: "Rice", description: m.rice },
            { item: "Indian Bread", description: m.bread },
            { item: "Dal Dish", description: m.dal },
            { item: "Main Course (Veg)", description: m.mainVeg },
            { item: "Main Course (Non-Veg)", description: m.mainNonVeg },
            {
              item: "Curd & Accompaniments",
              description:
                "Branded Curd / Mishti Doi + Seasonal Dry Veg (" +
                m.dryVeg +
                ") + Pickle blister pack & Napkin.",
            },
            { item: "Dessert", description: m.dessert },
          ],
        },
        {
          service: "Evening Snacks",
          price: 140,
          items: [
            {
              item: "Dry Fruits & Savouries",
              description:
                "Branded Salted Cashews / Roasted Almonds packet + Branded Namkeen packet.",
            },
            { item: "Hot Snack", description: m.snacks },
            {
              item: "Beverage",
              description:
                "Branded Tetra Pack Juice / Flavoured Milk / Coconut Water + Hot Premix Tea or Coffee.",
            },
          ],
        },
      ],
    },
    {
      classCode: "2A / 3A",
      className: "AC 2-Tier & 3-Tier (2A / 3A)",
      services: [
        {
          service: "Morning Tea",
          price: 20,
          items: [
            {
              item: "Hot Beverage",
              description:
                "Choice of Premix Tea, Coffee, Green Tea or Lemon Tea with Sugar / Sugar-free sachet.",
            },
            {
              item: "Biscuits",
              description: "Marie / Ragi Biscuits (2 Pcs packet).",
            },
          ],
        },
        {
          service: "Breakfast",
          price: 105,
          items: [
            {
              item: "Welcome Drink",
              description:
                "Branded Tetra Pack Fruit Drink (Mango/Orange/Guava) or Lassi / Buttermilk.",
            },
            { item: "Vegetarian Breakfast", description: m.breakfastVeg },
            { item: "Non-Vegetarian Breakfast", description: m.breakfastNonVeg },
            {
              item: "Beverage",
              description:
                "Tea / Coffee / Green Tea with Dairy Creamer, Stirrer & Disposable Cup.",
            },
          ],
        },
        {
          service: "Lunch/Dinner",
          price: 185,
          items: [
            { item: "Rice", description: m.rice },
            { item: "Indian Bread", description: m.bread },
            { item: "Dal Dish", description: m.dal },
            { item: "Main Course (Veg)", description: m.mainVeg },
            { item: "Main Course (Non-Veg)", description: m.mainNonVeg },
            {
              item: "Accompaniments",
              description:
                "Branded Fresh Curd + Seasonal Dry Veg (" +
                m.dryVeg +
                ") + Pickle sachet & Salt/Pepper.",
            },
            { item: "Dessert", description: m.dessert },
          ],
        },
        {
          service: "Evening Snacks",
          price: 90,
          items: [
            { item: "Snacks", description: m.snacks },
            {
              item: "Beverage",
              description:
                "Choice of Tea / Coffee with Dairy Creamer, Sugar & Disposable Cup.",
            },
          ],
        },
      ],
    },
  ];
}

/** Build classes for Shatabdi Express (Executive EC & Chair Car CC). */
function buildShatabdiClasses(zone: TrainZone): FoodMenuClass[] {
  const raj = buildRajdhaniClasses(zone);
  return [
    {
      classCode: "EC",
      className: "Executive Chair Car (EC)",
      services: raj[0].services,
    },
    {
      classCode: "CC",
      className: "AC Chair Car (CC)",
      services: raj[1].services,
    },
  ];
}

/** Build classes for Duronto Express (1A, 2A/3A, Sleeper SL). */
function buildDurontoClasses(zone: TrainZone): FoodMenuClass[] {
  const raj = buildRajdhaniClasses(zone);
  const sleeperClass: FoodMenuClass = {
    classCode: "SL",
    className: "Sleeper Class (SL)",
    services: [
      {
        service: "Morning Tea",
        price: 15,
        items: [
          {
            item: "Hot Beverage",
            description:
              "Tea / Coffee kit (Tea bag / instant coffee powder, milk creamer sachet, sugar sachet) + 2 Marie Biscuits.",
          },
        ],
      },
      {
        service: "Breakfast",
        price: 65,
        items: [
          {
            item: "Vegetarian Option",
            description:
              "4 Pooris with Aloo Bhaji (150g) OR 2 Veg Cutlets with 2 bread slices, butter chiplet & ketchup + Tea/Coffee kit.",
          },
          {
            item: "Non-Vegetarian Option",
            description:
              "2-Egg Omelette with 2 bread slices, butter chiplet, ketchup & salt/pepper + Tea/Coffee kit.",
          },
        ],
      },
      {
        service: "Lunch/Dinner",
        price: 120,
        items: [
          {
            item: "Standard Casserole Meal (Veg)",
            description:
              "Plain Rice (150g), 4 Chapatis / 2 Parathas, Dal (150g), Mixed Veg / Paneer Dish (100g), Curd (80g), Pickle sachet & Indian Sweet.",
          },
          {
            item: "Standard Casserole Meal (Non-Veg)",
            description:
              "Plain Rice (150g), 4 Chapatis / 2 Parathas, Dal (150g), Egg Curry (2 eggs) OR Chicken Curry (60g chicken + 90g gravy), Curd, Pickle sachet & Sweet.",
          },
        ],
      },
      {
        service: "Evening Snacks",
        price: 50,
        items: [
          {
            item: "Snack & Sweet",
            description:
              "1 Samosa / Kachori (50g) + Namkeen packet (25g) + 1 Indian Sweet + Tea/Coffee kit with disposable cup.",
          },
        ],
      },
    ],
  };

  return [raj[0], raj[1], sleeperClass];
}

/** Build classes for Vande Bharat Express fallback standard menu. */
function buildVandeBharatClasses(zone: TrainZone): FoodMenuClass[] {
  const m = ZONE_MEALS[zone];
  return [
    {
      classCode: "EC",
      className: "Executive Chair Car (EC)",
      services: [
        {
          service: "Morning Tea",
          price: 15,
          items: [
            {
              item: "Hot Beverage",
              description:
                "Choice of Branded Premix Tea, Coffee, Green Tea, Lemon Tea with Sugar / Sugar-free sachet.",
            },
            {
              item: "Biscuits",
              description:
                "Branded Digestive Biscuits / Millet based Cookies (2 Pcs).",
            },
            {
              item: "Sanitary Kit",
              description:
                "Stainless Steel Tea Spoon, Good quality paper napkin tissue, Sanitizer.",
            },
          ],
        },
        {
          service: "Breakfast",
          price: 155,
          items: [
            {
              item: "Cereal",
              description:
                "Corn Flakes, Muesli, Millet Flakes, Oats with milk (Hot/Cold) and sugar.",
            },
            { item: "Vegetarian Breakfast", description: m.breakfastVeg },
            { item: "Non-Vegetarian Breakfast", description: m.breakfastNonVeg },
            {
              item: "Cake (Eggless) & Fruits",
              description:
                "Branded Eggless Muffin, Walnut cake, Brownie + Fresh Banana or Apple.",
            },
            {
              item: "Drinks",
              description:
                "Branded Coconut water, Diet Drink, Lassi, Flavoured Milk or Fruit Juice.",
            },
          ],
        },
        {
          service: "Lunch/Dinner",
          price: 244,
          items: [
            {
              item: "Veg Soup",
              description:
                "Branded Pre-mix Hot & Sour / Sweet Corn / Manchow Soup + Soup sticks (2 Pcs) & Butter Chiplet.",
            },
            { item: "Rice", description: m.rice },
            { item: "Indian Bread", description: m.bread },
            { item: "Dal Dish", description: m.dal },
            { item: "Main Course Veg Dish", description: m.mainVeg },
            { item: "Main Course Non-Veg Dish", description: m.mainNonVeg },
            {
              item: "Curd & Accompaniments",
              description:
                "Branded Curd + Seasonal Dry Veg (" +
                m.dryVeg +
                ") + Pickle blister pack.",
            },
            { item: "Dessert", description: m.dessert },
          ],
        },
        {
          service: "Evening Snacks",
          price: 105,
          items: [
            { item: "Snacks Box", description: m.snacks },
            {
              item: "Dry Fruits",
              description:
                "Branded Salted Cashews, Salted Pistachios, Salted Almonds or Roasted Makhana packet.",
            },
            {
              item: "Drinks & Hot Beverage",
              description:
                "Branded Coconut water / Lassi / Juice + Premix Tea / Coffee.",
            },
          ],
        },
      ],
    },
    {
      classCode: "CC",
      className: "Chair Car (CC)",
      services: [
        {
          service: "Morning Tea",
          price: 15,
          items: [
            {
              item: "Hot Beverage",
              description:
                "Choice of Premix Tea, Coffee, Green Tea, Lemon Tea with Sugar / Sugar-free sachet.",
            },
            {
              item: "Biscuits",
              description:
                "Branded Digestive Biscuits / Millet Cookies (2 Pcs).",
            },
          ],
        },
        {
          service: "Breakfast",
          price: 122,
          items: [
            { item: "Vegetarian Breakfast", description: m.breakfastVeg },
            { item: "Non-Vegetarian Breakfast", description: m.breakfastNonVeg },
            {
              item: "Cake & Beverage",
              description:
                "Branded Eggless Muffin / Fruit Cake + Tea / Coffee.",
            },
          ],
        },
        {
          service: "Lunch/Dinner",
          price: 222,
          items: [
            { item: "Rice", description: m.rice },
            { item: "Indian Bread", description: m.bread },
            { item: "Dal Dish", description: m.dal },
            { item: "Main Course Veg Dish", description: m.mainVeg },
            { item: "Main Course Non-Veg Dish", description: m.mainNonVeg },
            {
              item: "Curd & Dry Veg",
              description:
                "Branded Curd + Dry Veg (" + m.dryVeg + ") + Pickle sachet.",
            },
            { item: "Dessert", description: m.dessert },
          ],
        },
        {
          service: "Evening Snacks",
          price: 66,
          items: [
            { item: "Snacks Box", description: m.snacks },
            {
              item: "Drinks & Beverage",
              description:
                "Branded Fruit Juice / Lassi / Coconut Water + Hot Premix Tea or Coffee.",
            },
          ],
        },
      ],
    },
  ];
}

/** Standard IRCTC Mail, Express, Superfast, Garib Rath and Humsafar Catering. */
function buildMailExpressClasses(trainType: TrainType): FoodMenuClass[] {
  const commonServices: FoodMenuService[] = [
    {
      service: "Standard Meals",
      price: 80,
      items: [
        {
          item: "Veg Standard Meal (Casserole)",
          description:
            "Plain Rice (150g), 2 Parathas / 4 Chapatis (100g), Dal / Sambar (150g), Mixed Seasonal Veg (100g), Branded Curd (80g), Pickle (12g). Price: ₹80 on-board (₹70 at station).",
        },
        {
          item: "Egg Curry Meal with Rice",
          description:
            "Plain Rice (150g), 2 Parathas / 4 Chapatis, Dal / Sambar (150g), Two-Egg Curry (150g), Branded Curd (80g), Pickle. Price: ₹90 on-board (₹80 at station).",
        },
        {
          item: "Chicken Curry Meal with Rice",
          description:
            "Plain Rice (150g), 2 Parathas / 4 Chapatis, Dal / Sambar (150g), Boneless Chicken Curry (60g chicken + 90g gravy), Curd (80g), Pickle. Price: ₹130 on-board (₹120 at station).",
        },
        {
          item: "Veg Biryani (350g Casserole)",
          description:
            "Biryani (270g incl. 70g vegetables), Branded Curd (80g), Pickle (12g), Tissue & Spoon. Price: ₹80 on-board (₹70 at station).",
        },
        {
          item: "Egg Biryani (350g Casserole)",
          description:
            "Biryani (270g incl. 2 boiled eggs), Branded Curd (80g), Pickle, Tissue & Spoon. Price: ₹90 on-board (₹80 at station).",
        },
        {
          item: "Chicken Biryani (350g Casserole)",
          description:
            "Biryani (270g incl. 70g boneless chicken), Branded Curd (80g), Pickle, Tissue & Spoon. Price: ₹110 on-board (₹100 at station).",
        },
        {
          item: "Janta Khana / Economy Meal",
          description:
            "7 Pooris (175g), Aloo Dry Curry (150g), Pickle (15g). Price: ₹20 on-board (₹15 at station).",
        },
      ],
    },
    {
      service: "Breakfast",
      price: 40,
      items: [
        {
          item: "Veg Cutlet Breakfast",
          description:
            "2 Bread slices (50g), 2 Veg Cutlets (100g), Butter chiplet (8g), Tomato Ketchup sachet (12g), Napkin & Spoon. Price: ₹40 on-board (₹35 at station).",
        },
        {
          item: "Idli & Vada Breakfast",
          description:
            "2 Idlis (100g), 2 Vadas (60g), Coconut Chutney (50g), Napkin & Spoon. Price: ₹40 on-board (₹35 at station).",
        },
        {
          item: "Upma & Vada Breakfast",
          description:
            "Upma (100g), 2 Vadas (60g), Coconut Chutney (50g), Napkin & Spoon. Price: ₹40 on-board (₹35 at station).",
        },
        {
          item: "Pongal & Vada Breakfast",
          description:
            "Pongal (100g), 2 Vadas (60g), Coconut Chutney (50g), Napkin & Spoon. Price: ₹40 on-board (₹35 at station).",
        },
        {
          item: "Non-Veg Egg Omelette Breakfast",
          description:
            "2 Bread slices (50g), 2-Egg Omelette / Boiled Eggs (90g), Butter chiplet (8g), Tomato Ketchup, Salt & Pepper sachets. Price: ₹50 on-board (₹45 at station).",
        },
      ],
    },
    {
      service: "Beverages & Water",
      price: 10,
      items: [
        {
          item: "Standard Tea",
          description:
            "150 ml standard tea in a 170 ml disposable cup. Price: ₹5 at station & on-board.",
        },
        {
          item: "Tea with Tea Bag (Dip Tea)",
          description:
            "150 ml dip tea in a 170 ml disposable cup with sugar sachet & milk creamer. Price: ₹10.",
        },
        {
          item: "Instant Coffee",
          description:
            "150 ml coffee in a 170 ml disposable cup with instant coffee powder sachet & milk. Price: ₹10.",
        },
        {
          item: "Rail Neer Packaged Drinking Water (1 Litre)",
          description:
            "1000 ml chilled Rail Neer packaged drinking water bottle. Price: ₹14.",
        },
        {
          item: "Rail Neer Packaged Drinking Water (500 ml)",
          description:
            "500 ml chilled Rail Neer packaged drinking water bottle. Price: ₹9.",
        },
      ],
    },
    {
      service: "Popular À La Carte Snacks",
      price: 20,
      items: [
        {
          item: "Samosa (2 Pcs)",
          description:
            "2 crispy potato samosas (50g each) with Tomato Ketchup sachet. Price: ₹20.",
        },
        {
          item: "Kachori (2 Pcs)",
          description:
            "2 dal/onion kachoris (40g each) with Tomato Ketchup sachet. Price: ₹20.",
        },
        {
          item: "Bread Pakora",
          description:
            "80g stuffed bread pakora with Tomato Ketchup or Mint Chutney. Price: ₹30.",
        },
        {
          item: "Poha",
          description:
            "150g freshly tempered Poha with sev & namkeen garnish. Price: ₹30.",
        },
        {
          item: "Masala Dosa",
          description:
            "Crispy Dosa (70g) + Potato Masala (80g) + Chutney (40g) + Sambar (100g). Price: ₹50.",
        },
        {
          item: "Pav Bhaji",
          description:
            "2 Butter Pavs (30g each) + Spiced Veg Bhaji (200g) + Onions & Lemon. Price: ₹50.",
        },
        {
          item: "Veg Burger",
          description:
            "Fresh Bun (35g) + Cooked Veg Patty (75g) + Tomato/Onion slice + Ketchup. Price: ₹50.",
        },
        {
          item: "Gulab Jamun / Jalebi",
          description:
            "2 Sweet Gulab Jamuns (30g each) or Fresh Jalebi (60g). Price: ₹20.",
        },
      ],
    },
  ];

  if (trainType === "humsafar") {
    // Add Humsafar AVM vending items
    commonServices[2].items.unshift(
      {
        item: "AVM Vending Machine Tea (Humsafar)",
        description:
          "100 ml hot tea without tea bag via on-board AVM machine in a 120 ml cup. Price: ₹10.",
      },
      {
        item: "AVM Vending Machine Coffee (Humsafar)",
        description:
          "100 ml hot coffee via on-board AVM machine. Price: ₹15.",
      },
      {
        item: "AVM Vending Machine Hot Soup (Humsafar)",
        description: "100 ml hot soup via on-board AVM machine. Price: ₹15.",
      },
    );
  }

  if (trainType === "garib-rath" || trainType === "ac-express") {
    return [
      {
        classCode: "3A",
        className: "AC 3-Tier (3A)",
        services: commonServices,
      },
      {
        classCode: "CC",
        className: "AC Chair Car (CC)",
        services: commonServices,
      },
    ];
  }

  if (trainType === "jan-shatabdi") {
    return [
      {
        classCode: "CC",
        className: "AC Chair Car (CC)",
        services: commonServices,
      },
      {
        classCode: "2S",
        className: "Second Seating (2S)",
        services: commonServices,
      },
    ];
  }

  return [
    {
      classCode: "SL",
      className: "Sleeper Class (SL)",
      services: commonServices,
    },
    {
      classCode: "3A",
      className: "AC 3-Tier (3A)",
      services: commonServices,
    },
    {
      classCode: "2A",
      className: "AC 2-Tier (2A)",
      services: commonServices,
    },
    {
      classCode: "2S",
      className: "Second Seating (2S)",
      services: commonServices,
    },
  ];
}

/** Official catering notes based on train type. */
function getTrainNotes(trainType: TrainType): string[] {
  switch (trainType) {
    case "rajdhani":
      return [
        "Catering charges on Rajdhani Express are inclusive of GST and all applicable taxes.",
        "Passengers who opted out of catering during ticket booking can purchase standard meals and beverages on board subject to availability.",
        "Meals are served in hygienic aluminium casseroles with sealed disposable cutlery and napkins.",
        "Rail Neer packaged drinking water (1 Litre per passenger for full journey, 500ml for short journeys) is provided complimentary where catering is opted.",
        "The food menu operates on a cyclic rotation to ensure regional variety and fresh preparation.",
      ];
    case "shatabdi":
      return [
        "Catering charges on Shatabdi Express are inclusive of all taxes and served directly at your seat.",
        "Executive Chair Car (EC) passengers receive upgraded luxury meals, soup courses, and roasted dry fruits.",
        "Passengers with optional catering can purchase tea, coffee, breakfast, and meals from the on-board pantry car.",
        "Strict quality standards and sealed food trays are inspected by IRCTC catering supervisors.",
      ];
    case "duronto":
      return [
        "Duronto Express catering includes dedicated meal services across First AC, 2-Tier, 3-Tier, and Sleeper coaches.",
        "Sleeper class passengers can pre-book meals with ticket booking or buy on board at fixed standard IRCTC rates.",
        "Cyclic menus rotate across Northern, Southern, Eastern, and Western regional cuisines depending on the route.",
        "All cooked food items bear FSSAI packaging stickers and expiry verification.",
      ];
    case "vande-bharat":
      return [
        "All Executive Class passengers are welcomed on board with fresh morning services and premium snacks.",
        "All cooked meal packets bear QR Codes with details of FSSAI license, packaging date, weight, and Veg/Non-Veg stickers.",
        "Pre-mix Tea/Coffee/Green Tea is served with stirrer, paper napkin & hot water in hard-ribbed paper cups.",
        "Only boneless chicken is used for chicken dish preparations. Neck and wing portions are not served.",
        "Extra Tea/Coffee service is provided on demand without extra charges on Vande Bharat trains.",
      ];
    case "humsafar":
      return [
        "Humsafar Express features on-board Automatic Vending Machines (AVM) for dispensing fresh hot tea, coffee, and soup.",
        "Meals and breakfast can be purchased from authorized IRCTC catering staff with printed POS bills.",
        "Overcharging is strictly prohibited; always ask for a computer-generated GST bill with IRCTC logo.",
      ];
    default:
      return [
        "IRCTC standard catering rates are fixed across Indian Railways — no vendor is permitted to charge above the printed tariff.",
        "Always demand a printed POS / computerized bill for every meal or beverage purchased on board.",
        "Packaged drinking water must strictly be Rail Neer (₹15 for 1L) where available; report unauthorized local brands to RailMadad (139).",
        "Janta Meal (Poori Aloo) is available as an economical option at ₹20 on board (₹15 at station stalls).",
        "For grievances or food quality complaints, dial 139 or tweet @IRCTCofficial / @RailMinIndia.",
      ];
  }
}

/**
 * Synthesize a full TrainFoodMenu structure for any mapped train in the registry.
 */
export function synthesizeTrainFoodMenu(
  entry: TrainRegistryEntry,
): TrainFoodMenu {
  const { trainNumber, trainNumberPair, trainName, slug, trainType, zone } =
    entry;

  let classes: FoodMenuClass[];
  switch (trainType) {
    case "rajdhani":
      classes = buildRajdhaniClasses(zone);
      break;
    case "shatabdi":
      classes = buildShatabdiClasses(zone);
      break;
    case "duronto":
      classes = buildDurontoClasses(zone);
      break;
    case "vande-bharat":
      classes = buildVandeBharatClasses(zone);
      break;
    case "tejas":
    case "gatimaan":
      classes = buildShatabdiClasses(zone);
      break;
    default:
      classes = buildMailExpressClasses(trainType);
      break;
  }

  const notes = getTrainNotes(trainType);
  const sourcePdfUrl =
    trainType === "vande-bharat"
      ? "https://menurates.irctc.co.in/"
      : "https://menurates.irctc.co.in/PDFFiles/MenuandTariffforA-la-Carteitems.pdf";

  return {
    trainNumber,
    trainNumberPair: trainNumberPair || trainNumber,
    trainName,
    route: entry.route || "",
    originCode: null,
    destinationCode: null,
    slug,
    classes,
    notes,
    sourcePdfUrl,
    generatedAt: new Date().toISOString(),
  };
}
