// Splits plain text into text and web links, so a post's URLs can be
// clicked. Only http(s): anything else stays text.
export type Piece = { text: string } | { url: string };

const URL_RE = /https?:\/\/[^\s<>"']+/g;
// Punctuation that ends a sentence rather than the address.
const TRAILING = /[.,;:!?'"]+$/;

export function linkify(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let url = match[0].replace(TRAILING, "");
    // A closing parenthesis belongs to the address only if it opened one:
    // "(see https://x.com/a)" vs "https://en.wikipedia.org/wiki/X_(y)".
    while (url.endsWith(")") && count(url, "(") < count(url, ")")) {
      url = url.slice(0, -1).replace(TRAILING, "");
    }
    const start = match.index;
    if (start > last) pieces.push({ text: text.slice(last, start) });
    pieces.push({ url });
    last = start + url.length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

const count = (s: string, c: string) => s.split(c).length - 1;
