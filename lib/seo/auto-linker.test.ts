import test from "node:test";
import assert from "node:assert/strict";
import { autoLinkGlossaryTerms } from "./auto-linker";

test("autoLinkGlossaryTerms - auto-links standalone glossary terms", () => {
  const input = "Understand your WL ticket status and RAC confirmation chances.";
  const output = autoLinkGlossaryTerms(input);
  assert.strictEqual(
    output,
    "Understand your [WL](/glossary/wl) ticket status and [RAC](/glossary/rac) confirmation chances."
  );
});

test("autoLinkGlossaryTerms - skips terms inside existing markdown links", () => {
  const input = "Check [WL status](/glossary/wl) or [RLWL](/glossary/rlwl) here.";
  const output = autoLinkGlossaryTerms(input);
  assert.strictEqual(
    output,
    "Check [WL status](/glossary/wl) or [RLWL](/glossary/rlwl) here."
  );
});

test("autoLinkGlossaryTerms - skips terms inside inline code blocks", () => {
  const input = "Use code `WL` or term WL in text.";
  const output = autoLinkGlossaryTerms(input);
  assert.strictEqual(output, "Use code `WL` or term [WL](/glossary/wl) in text.");
});

test("autoLinkGlossaryTerms - handles empty input gracefully", () => {
  assert.strictEqual(autoLinkGlossaryTerms(""), "");
});
