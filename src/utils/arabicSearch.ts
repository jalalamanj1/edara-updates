/**
 * Normalize a string for Arabic-aware local search comparison.
 *
 * Rules:
 * - Apply Unicode NFKC normalization.
 * - Map أ / آ / إ  →  ا  (so "اسلام" matches "إسلام", etc.).
 * - Lowercase Latin characters.
 * - Trim surrounding whitespace.
 *
 * The original text is never mutated; this is only used internally for matching.
 */
export function normalizeArabicSearch(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(/[أآإ]/g, 'ا')
    .toLowerCase()
    .trim();
}
