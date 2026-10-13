/** What a person types in a tags field: names separated by commas. The API normalizes each one. */
export function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** The API's rule for a tag name, so a form can say it before sending. */
export function isValidTag(tag: string): boolean {
  const normalized = tag.trim().replace(/^#+/, '').trim().replace(/\s+/g, '-');
  return normalized.length > 0 && normalized.length <= 40 && /^[\p{L}\p{N}_-]+$/u.test(normalized);
}
