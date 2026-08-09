import fs from "fs";
import path from "path";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

interface Frontmatter {
  title: string;
  description: string;
  date: string;
  updated?: string;
  tags: string[];
}

function parseMarkdownPost(filePath: string): { frontmatter: Frontmatter; markdownBody: string } {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    throw new Error(`Invalid frontmatter in file: ${filePath}`);
  }

  const yamlStr = match[1];
  const markdownBody = match[2].trim();

  const titleMatch = yamlStr.match(/^title:\s*"(.*?)"/m);
  const descMatch = yamlStr.match(/^description:\s*"(.*?)"/m);
  const dateMatch = yamlStr.match(/^date:\s*"(.*?)"/m);
  const updatedMatch = yamlStr.match(/^updated:\s*"(.*?)"/m);

  const tags: string[] = [];
  const tagsSectionMatch = yamlStr.match(/^tags:\r?\n((?:\s*-\s*.*(?:\r?\n|$))+)/m);
  if (tagsSectionMatch) {
    const lines = tagsSectionMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const tagMatch = line.match(/\s*-\s*(.*)/);
      if (tagMatch) {
        const cleanTag = tagMatch[1].trim().replace(/^["']|["']$/g, "");
        if (cleanTag) tags.push(cleanTag);
      }
    }
  }

  const frontmatter: Frontmatter = {
    title: titleMatch ? titleMatch[1] : "",
    description: descMatch ? descMatch[1] : "",
    date: dateMatch ? dateMatch[1] : "",
    updated: updatedMatch ? updatedMatch[1] : undefined,
    tags,
  };

  return { frontmatter, markdownBody };
}

interface MediumPostPayload {
  title: string;
  contentFormat: "markdown";
  content: string;
  canonicalUrl: string;
  tags?: string[];
  publishStatus?: "draft" | "public" | "unlisted";
}

async function getMediumUser(token: string): Promise<{ id: string; username: string; name: string }> {
  const res = await fetch("https://api.medium.com/v1/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Medium User API error (HTTP ${res.status}): ${errText}`);
  }

  const json = (await res.json()) as { data: { id: string; username: string; name: string } };
  return json.data;
}

async function createMediumPost(token: string, userId: string, payload: MediumPostPayload): Promise<any> {
  const res = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Medium Create Post API error (HTTP ${res.status}): ${errText}`);
  }

  const json = await res.json();
  return json.data;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Medium Syndication Tool for LastBerth Daily Blog

Usage:
  npx tsx scripts/syndicate-to-medium.ts <slug> [options]
  npx tsx scripts/syndicate-to-medium.ts irctc-current-availability-explained --dry-run
  npx tsx scripts/syndicate-to-medium.ts irctc-current-availability-explained --status public

Options:
  --dry-run, -d       Preview post payload and canonical URL without making Medium API calls
  --status <status>   Publish status on Medium: 'draft' (default) or 'public'
  --token <token>     Override MEDIUM_INTEGRATION_TOKEN environment variable
  --help, -h          Show this help message
`);
    process.exit(0);
  }

  let slug: string | null = null;
  let isDryRun = false;
  let publishStatus: "draft" | "public" = "draft";
  let tokenOverride: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run" || arg === "-d") {
      isDryRun = true;
    } else if (arg === "--status") {
      const val = args[++i];
      if (val === "public" || val === "draft") {
        publishStatus = val;
      }
    } else if (arg === "--token") {
      tokenOverride = args[++i];
    } else if (!arg.startsWith("-")) {
      slug = arg.replace(/\.md$/, "");
    }
  }

  if (!slug) {
    console.error("❌ Error: Please specify a blog post slug (e.g. irctc-current-availability-explained)");
    process.exit(1);
  }

  const filePath = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: Blog post markdown file not found: ${filePath}`);
    process.exit(1);
  }

  const { frontmatter, markdownBody } = parseMarkdownPost(filePath);
  const canonicalUrl = `https://lastberth.com/blog/${slug}`;

  // Medium allows max 5 tags, alphanumeric/hyphens
  const formattedTags = frontmatter.tags
    .slice(0, 5)
    .map((t) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim())
    .filter(Boolean);

  // Prepare full markdown content for Medium
  const fullMediumContent = `# ${frontmatter.title}\n\n*Originally published on [LastBerth](${canonicalUrl})*\n\n${markdownBody}`;

  const payload: MediumPostPayload = {
    title: frontmatter.title,
    contentFormat: "markdown",
    content: fullMediumContent,
    canonicalUrl,
    tags: formattedTags,
    publishStatus,
  };

  console.log(`\n📰 Medium Syndication Target:`);
  console.log(`   Slug:           ${slug}`);
  console.log(`   Title:          ${frontmatter.title}`);
  console.log(`   Canonical URL:  ${canonicalUrl}`);
  console.log(`   Publish Status: ${publishStatus}`);
  console.log(`   Tags:           ${formattedTags.join(", ") || "(none)"}`);

  if (isDryRun) {
    console.log(`\n📋 [DRY-RUN] Medium Post Payload Preview:`);
    console.log(JSON.stringify(payload, null, 2));
    console.log(`\n✅ Dry run completed successfully! No API calls were made.`);
    process.exit(0);
  }

  const token = tokenOverride || process.env.MEDIUM_INTEGRATION_TOKEN;
  if (!token) {
    console.error(`\n❌ Error: MEDIUM_INTEGRATION_TOKEN is not set in environment or provided via --token.`);
    console.error(`   You can test payload formatting without a token using --dry-run.`);
    process.exit(1);
  }

  console.log(`\n🔑 Authenticating with Medium API...`);
  const user = await getMediumUser(token);
  console.log(`   Authenticated as Medium User: @${user.username} (${user.name}) [ID: ${user.id}]`);

  console.log(`\n🚀 Submitting post to Medium...`);
  const result = await createMediumPost(token, user.id, payload);
  console.log(`\n🎉 Post successfully syndicated to Medium!`);
  console.log(`   Medium URL: ${result.url}`);
  console.log(`   Status:     ${result.publishStatus}`);
}

main().catch((err) => {
  console.error("Fatal error during Medium syndication:", err);
  process.exit(1);
});
