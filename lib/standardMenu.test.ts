import test from "node:test";
import assert from "node:assert/strict";
import {
  getStandardMenuGroup,
  listStandardMenuSlugs,
  standardMenuMetadata,
} from "./standardMenu";

test("getStandardMenuGroup - returns group for valid slug", () => {
  const group = getStandardMenuGroup("ac-coach-food-menu-prices");
  assert.ok(group);
  assert.equal(group?.classGroup, "2A-3A-CC");
  assert.ok(group?.zones.length > 0);
});

test("getStandardMenuGroup - handles slug alias", () => {
  const group = getStandardMenuGroup("ac-2a-3a-cc");
  assert.ok(group);
  assert.equal(group?.classGroup, "2A-3A-CC");
});

test("getStandardMenuGroup - returns null for invalid slug", () => {
  const group = getStandardMenuGroup("nonexistent-slug");
  assert.equal(group, null);
});

test("listStandardMenuSlugs - returns non-redirect slugs", () => {
  const slugs = listStandardMenuSlugs();
  assert.ok(slugs.length > 0);
  assert.ok(!slugs.includes("ac-2a-3a-cc"));
  assert.ok(slugs.includes("ac-coach-food-menu-prices"));
});

test("standardMenuMetadata - generates page metadata", () => {
  const meta = standardMenuMetadata("ac-coach-food-menu-prices");
  assert.ok(meta);
  assert.equal(meta.title, "AC 2A/3A/Chair Car Food Menu & Meal Prices");
  assert.ok(meta.description?.includes("Official IRCTC food menu"));
});
