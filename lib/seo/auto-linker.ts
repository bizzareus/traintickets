import { getAllGlossaryTerms } from "./glossary-db";

/**
 * Automatically wraps known glossary terms in markdown links.
 * It attempts to avoid replacing terms that are already part of a link,
 * inside an image tag, or inside code blocks.
 */
export function autoLinkGlossaryTerms(markdown: string): string {
  let processed = markdown;
  const terms = getAllGlossaryTerms()
    // Sort by length descending so we match longest terms first (e.g. RLWL before WL)
    .sort((a, b) => b.id.length - a.id.length);

  for (const term of terms) {
    // Only match standalone words (e.g. RLWL, not RLWL123)
    // Avoid matching if already in a markdown link: [RLWL](...)
    // This is a simplified regex; a robust solution would use an AST parser.
    // (?<!\[[^\]]*) checks we are not inside the brackets of a markdown link
    // (?![^\[]*\]\() checks we are not immediately followed by ](
    
    // Because JS regex lookbehind can be tricky with variable lengths, 
    // we use a simpler approach: replace globally, but in a custom replacer function
    // we skip replacing if we are inside a code block or link.
    
    // We'll create a regex for the term ID (e.g. RLWL, GNWL)
    const regex = new RegExp(`\\b(${term.id})\\b`, 'gi');
    
    processed = processed.replace(regex, (match, p1, offset, string) => {
      // Very basic check: are we inside backticks?
      const before = string.slice(0, offset);
      const backticksBefore = (before.match(/`/g) || []).length;
      if (backticksBefore % 2 !== 0) return match; // Inside code
      
      // Basic check: are we inside a markdown link?
      const openBracket = before.lastIndexOf('[');
      const closeBracket = before.lastIndexOf(']');
      if (openBracket > closeBracket) return match; // Inside [ ]
      
      // If safe, wrap it
      return `[${match}](/glossary/${term.id})`;
    });
  }

  return processed;
}
