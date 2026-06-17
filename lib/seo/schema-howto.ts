export type HowToStep = {
  name: string;
  text: string;
};

export type HowToSchema = {
  name: string;
  steps: HowToStep[];
};

/**
 * Extracts HowTo steps from blog markdown content.
 * Looks for H2 headings starting with "How to" or "How To".
 * The numbered list (1., 2., 3.) immediately following it is parsed as steps.
 */
export function parseHowToFromMarkdown(markdown: string): HowToSchema | null {
  const lines = markdown.split("\n");
  
  let inHowToSection = false;
  let howToName = "";
  const steps: HowToStep[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();

    // Detect HowTo section start
    if (/^##\s+how\s+to\s+/i.test(trimmed)) {
      inHowToSection = true;
      howToName = trimmed.replace(/^##\s+/i, "");
      continue;
    }

    if (!inHowToSection) continue;

    // End of HowTo section (another H2)
    if (/^##\s+/.test(trimmed) && !/^##\s+how\s+to\s+/i.test(trimmed)) {
      break;
    }

    // Detect numbered list item (e.g., "1. Go to IRCTC website")
    const match = trimmed.match(/^\d+\.\s+(.*)/);
    if (match) {
      const stepText = match[1].trim()
        .replace(/\*\*([^*]+)\*\*/g, "$1")  // bold
        .replace(/\*([^*]+)\*/g, "$1")       // italic
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // links
        .replace(/`([^`]+)`/g, "$1");        // inline code
      
      steps.push({
        name: `Step ${steps.length + 1}`,
        text: stepText
      });
    }
  }

  if (steps.length > 0 && howToName) {
    return {
      name: howToName,
      steps
    };
  }

  return null;
}
