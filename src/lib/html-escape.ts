// One HTML escaper for the whole codebase.
//
// Three copies of this function had drifted apart — chapters.ts escaped
// & < > " and speakers.ts escaped & " < — and the newsletter template needed a
// fourth. Escaping all four characters is correct in both text content and in a
// double-quoted attribute value, so one function serves every caller.
//
// Not to be confused with `xml()` in the RSS route, which also escapes ' because
// XML wants it.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
