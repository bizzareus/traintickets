import test from "node:test";
import assert from "node:assert/strict";
import {
  getGlossaryTerm,
  getAllGlossaryTerms,
  getAllGlossaryTermsForLang,
} from "./glossary-db";

test("getGlossaryTerm - returns term by id using O(1) Map", () => {
  const term = getGlossaryTerm("wl");
  assert.ok(term);
  assert.equal(term?.id, "wl");
  assert.ok(term?.term.includes("WL"));

  const missing = getGlossaryTerm("nonexistent_id");
  assert.equal(missing, undefined);
});

test("getAllGlossaryTerms - returns pre-sorted terms", () => {
  const terms = getAllGlossaryTerms();
  assert.ok(terms.length > 0);

  // Verify sorting order
  for (let i = 0; i < terms.length - 1; i++) {
    assert.ok(
      terms[i].term.localeCompare(terms[i + 1].term) <= 0,
      `Expected ${terms[i].term} <= ${terms[i + 1].term}`
    );
  }
});

test("getAllGlossaryTermsForLang - caches and returns sorted terms for language", () => {
  const enTerms1 = getAllGlossaryTermsForLang("en");
  const enTerms2 = getAllGlossaryTermsForLang("en");
  assert.deepEqual(enTerms1, enTerms2);

  const hiTerms1 = getAllGlossaryTermsForLang("hi");
  const hiTerms2 = getAllGlossaryTermsForLang("hi");
  assert.deepEqual(hiTerms1, hiTerms2);
  assert.equal(hiTerms1.length, enTerms1.length);
});
