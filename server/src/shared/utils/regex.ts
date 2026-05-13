/**
 * Escapes special characters in a string for use in a regular expression.
 * This prevents ReDoS attacks and unintended regex behavior from user input.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
