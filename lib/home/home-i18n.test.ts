import assert from "node:assert/strict";
import { test } from "node:test";
import { getHomeStrings, isHomeLang } from "./home-i18n";

test("getHomeStrings - loads English base strings correctly", () => {
  const en = getHomeStrings("en");
  assert.ok(en);
  assert.ok(en.hero);
  assert.ok(en.hero.titleLead);
  assert.ok(en.hero.titleHighlight);
});

test("getHomeStrings - loads Hindi translations and falls back to English for missing keys", () => {
  const hi = getHomeStrings("hi");
  assert.ok(hi);
  assert.ok(hi.hero);
  assert.equal(typeof hi.hero.titleLead, "string");
});

test("getHomeStrings - falls back to English for unknown language code", () => {
  const unknownLang = getHomeStrings("unknown_lang_code");
  const en = getHomeStrings("en");
  assert.deepEqual(unknownLang, en);
});

test("getHomeStrings - returns cached reference on consecutive calls", () => {
  const call1 = getHomeStrings("hi");
  const call2 = getHomeStrings("hi");
  assert.strictEqual(call1, call2);
});

test("isHomeLang - validates supported home languages", () => {
  assert.equal(isHomeLang("en"), true);
  assert.equal(isHomeLang("hi"), true);
  assert.equal(isHomeLang("fr"), false);
});
