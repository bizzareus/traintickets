import test from "node:test";
import assert from "node:assert/strict";
import {
  isLowQualityTranslation,
  indexableTranslations,
  clearQualityCaches,
} from "./blog-quality";
import { listBlogPostSlugs } from "./blog";

test("isLowQualityTranslation - returns false for English", () => {
  clearQualityCaches();
  const slugs = listBlogPostSlugs("en");
  assert.ok(slugs.length > 0);

  const slug = slugs[0];
  assert.equal(isLowQualityTranslation(slug, "en"), false);
});

test("isLowQualityTranslation - caches results on subsequent calls", () => {
  clearQualityCaches();
  const slugs = listBlogPostSlugs("en");
  assert.ok(slugs.length > 0);

  const slug = slugs[0];
  const firstPass = isLowQualityTranslation(slug, "hi");
  const secondPass = isLowQualityTranslation(slug, "hi");

  assert.equal(firstPass, secondPass);
});

test("indexableTranslations - returns array including 'en' and caches result", () => {
  clearQualityCaches();
  const slugs = listBlogPostSlugs("en");
  assert.ok(slugs.length > 0);

  const slug = slugs[0];
  const result1 = indexableTranslations(slug);
  assert.ok(Array.isArray(result1));
  assert.ok(result1.includes("en"));

  const result2 = indexableTranslations(slug);
  assert.deepEqual(result1, result2);
});
