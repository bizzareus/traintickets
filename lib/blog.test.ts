import test from "node:test";
import assert from "node:assert/strict";
import {
  listBlogPostSlugs,
  listBlogPosts,
  getBlogPost,
  hasBlogPostTranslation,
  getAvailableTranslations,
  parseFaqFromMarkdown,
} from "./blog";

test("listBlogPostSlugs - lists blog post slugs for English", () => {
  const slugs = listBlogPostSlugs("en");
  assert.ok(Array.isArray(slugs));
  assert.ok(slugs.length > 0);
});

test("listBlogPosts - returns parsed blog posts metadata", () => {
  const posts = listBlogPosts("en");
  assert.ok(Array.isArray(posts));
  assert.ok(posts.length > 0);
  assert.ok(posts[0].slug);
  assert.ok(posts[0].title);
});

test("hasBlogPostTranslation - uses cached language slugs lookup", () => {
  const slugs = listBlogPostSlugs("en");
  if (slugs.length > 0) {
    const slug = slugs[0];
    const hasEn = hasBlogPostTranslation(slug, "en");
    assert.equal(hasEn, true);

    const available = getAvailableTranslations(slug);
    assert.ok(Array.isArray(available));
    assert.ok(available.includes("en"));
  }
});

test("getBlogPost - retrieves single post by slug", () => {
  const slugs = listBlogPostSlugs("en");
  if (slugs.length > 0) {
    const post = getBlogPost(slugs[0]);
    assert.ok(post);
    assert.equal(post?.slug, slugs[0]);
  }
});

test("parseFaqFromMarkdown - parses FAQ items from markdown content", () => {
  const markdown = `
## FAQ

### What is PNR?
PNR is Passenger Name Record.

### What is RAC?
RAC means Reservation Against Cancellation.
`;
  const faqs = parseFaqFromMarkdown(markdown);
  assert.equal(faqs.length, 2);
  assert.equal(faqs[0].question, "What is PNR?");
  assert.ok(faqs[0].answer.includes("Passenger Name Record"));
});
