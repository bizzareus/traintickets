import test from "node:test";
import assert from "node:assert/strict";
import { trackAdvertClicked, trackAdvertImpression } from "./track";
import { getAdvertHref } from "@/components/ads/SideAdvert";

test("getAdvertHref builds destination URL with default UTM parameters", () => {
  const href = getAdvertHref();
  assert.equal(
    href,
    "https://nariofficial.co/collection/velvet?utm_source=lastberth&utm_medium=external_website_homepage&utm_campaign=velvet",
  );
});

test("getAdvertHref customizes UTM medium for food menu and chart times", () => {
  const foodHref = getAdvertHref({ utmMedium: "external_website_food_menu" });
  assert.equal(
    foodHref,
    "https://nariofficial.co/collection/velvet?utm_source=lastberth&utm_medium=external_website_food_menu&utm_campaign=velvet",
  );

  const chartHref = getAdvertHref({ utmMedium: "external_website_chart_times" });
  assert.equal(
    chartHref,
    "https://nariofficial.co/collection/velvet?utm_source=lastberth&utm_medium=external_website_chart_times&utm_campaign=velvet",
  );
});

test("trackAdvertClicked runs cleanly without error", () => {
  assert.doesNotThrow(() => {
    trackAdvertClicked({
      link: "https://nariofficial.co/collection/velvet?utm_source=lastberth&utm_medium=external_website_food_menu&utm_campaign=velvet",
      page: "/irctc-train-food-menu/irctc-tejas-express-82902",
      format: "vertical",
      utmMedium: "external_website_food_menu",
    });
  });
});

test("trackAdvertImpression runs cleanly without error", () => {
  assert.doesNotThrow(() => {
    trackAdvertImpression({
      link: "https://nariofficial.co/collection/velvet?utm_source=lastberth&utm_medium=external_website_food_menu&utm_campaign=velvet",
      page: "/irctc-train-food-menu/irctc-tejas-express-82902",
      format: "vertical",
      utmMedium: "external_website_food_menu",
    });
  });
});
