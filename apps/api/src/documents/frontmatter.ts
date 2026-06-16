import { DocumentVisibility } from "../database/entities/types";

export type ParsedMarkdown = {
  metadata: {
    title: string;
    visibility: DocumentVisibility;
    teamSlug?: string;
    tags?: string[];
  };
  body: string;
};

export function parseMarkdownDocument(path: string, raw: string): ParsedMarkdown {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontmatter = match ? parseKeyValueBlock(match[1]) : {};
  const body = match ? match[2].trim() : raw.trim();

  const fallbackTitle = body.match(/^#\s+(.+)$/m)?.[1] ?? path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  const visibility = parseVisibility(frontmatter.visibility);

  return {
    metadata: {
      title: frontmatter.title ?? fallbackTitle,
      visibility,
      teamSlug: frontmatter.teamSlug,
      tags: frontmatter.tags?.split(",").map((tag) => tag.trim()).filter(Boolean)
    },
    body
  };
}

function parseKeyValueBlock(block: string): Record<string, string> {
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const [key, ...rest] = line.split(":");
        return [key.trim(), rest.join(":").trim().replace(/^["']|["']$/g, "")];
      })
  );
}

function parseVisibility(value?: string): DocumentVisibility {
  if (value === DocumentVisibility.Team || value === DocumentVisibility.Restricted) {
    return value;
  }
  return DocumentVisibility.Public;
}
