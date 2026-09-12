export interface GitignoreBlock {
  /** e.g. "Node.js (frontend/)" — must be unique per proposal so re-runs find their own block. */
  label: string;
  content: string;
}

function startMarker(label: string): string {
  return `# --- ${label} (auto-detected) ---`;
}

function endMarker(label: string): string {
  return `# --- end ${label} ---`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderBlock(block: GitignoreBlock): string {
  const body = block.content.trim();
  return `${startMarker(block.label)}\n${body}\n${endMarker(block.label)}`;
}

/**
 * Merges the given auto-detected blocks into `existingContent`, never
 * touching any line outside a block whose start/end markers it recognizes.
 * A block whose label already has a managed region gets that region
 * replaced in place (so re-running detection updates rather than
 * duplicates it); a new label is appended. Applying the exact same set of
 * blocks twice is a no-op on the second application (idempotent) because
 * the replacement is byte-for-byte deterministic.
 */
export function mergeGitignore(existingContent: string, blocks: GitignoreBlock[]): string {
  let content = existingContent;

  for (const block of blocks) {
    const rendered = renderBlock(block);
    const regex = new RegExp(`${escapeRegExp(startMarker(block.label))}[\\s\\S]*?${escapeRegExp(endMarker(block.label))}`, "m");

    if (regex.test(content)) {
      content = content.replace(regex, rendered);
    } else {
      const needsLeadingBlankLine = content.length > 0 && !content.endsWith("\n\n") && content.trim().length > 0;
      const separator = content.trim().length === 0 ? "" : needsLeadingBlankLine ? (content.endsWith("\n") ? "\n" : "\n\n") : "";
      content = `${content}${separator}${rendered}\n`;
    }
  }

  return content;
}

/** True if applying `blocks` to `existingContent` would change nothing — used to decide whether there's anything to suggest. */
export function isUpToDate(existingContent: string, blocks: GitignoreBlock[]): boolean {
  return mergeGitignore(existingContent, blocks) === existingContent;
}
