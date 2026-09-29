import { linkify } from "@/lib/linkify";

// Someone's words with their web links clickable (opening on their site,
// in a new tab). Everything else stays plain text.
export function LinkedText({ text }: { text: string }) {
  return linkify(text).map((piece, i) =>
    "url" in piece ? (
      <a
        key={i}
        href={piece.url}
        target="_blank"
        rel="noreferrer nofollow ugc"
        className="break-all"
      >
        {piece.url}
      </a>
    ) : (
      piece.text
    ),
  );
}
