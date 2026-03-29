// Generate flag emoji from 2-letter country code
export function countryFlag(code: string): string {
  if (code.length !== 2) return "\u{1F310}";
  const codePoints = [...code.toUpperCase()].map(
    (c) => 0x1f1e6 + c.charCodeAt(0) - 65
  );
  return String.fromCodePoint(...codePoints);
}
