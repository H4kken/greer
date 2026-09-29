import { describe, expect, it } from "vitest";
import { linkify } from "./linkify";

describe("linkify", () => {
  it("finds web links in text", () => {
    expect(linkify("Try https://greer.dev today")).toEqual([
      { text: "Try " },
      { url: "https://greer.dev" },
      { text: " today" },
    ]);
    expect(linkify("no links here")).toEqual([{ text: "no links here" }]);
  });

  it("leaves sentence punctuation out of the link", () => {
    expect(linkify("See http://x.com/a?b=1.")).toEqual([
      { text: "See " },
      { url: "http://x.com/a?b=1" },
      { text: "." },
    ]);
    expect(linkify("(docs: https://x.com/docs), then")).toEqual([
      { text: "(docs: " },
      { url: "https://x.com/docs" },
      { text: "), then" },
    ]);
  });

  it("keeps parentheses that belong to the address", () => {
    expect(linkify("https://en.wikipedia.org/wiki/Go_(game)")).toEqual([
      { url: "https://en.wikipedia.org/wiki/Go_(game)" },
    ]);
  });

  it("ignores other schemes", () => {
    expect(linkify("javascript:alert(1) ftp://x")).toEqual([
      { text: "javascript:alert(1) ftp://x" },
    ]);
  });
});
