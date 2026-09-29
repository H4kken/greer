// A short guide to Hacker News for people who don't use it much: what's
// there, where people say they're stuck, and which keyword fits where.
export function HnGuide() {
  return (
    <details className="group rounded-xl border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        How Hacker News works
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-muted-foreground">
        <p>
          Hacker News is a forum for people who build things. Everything is
          either a <strong className="text-foreground">post</strong> (a link or
          a short text) or a{" "}
          <strong className="text-foreground">comment</strong> under one. Most
          of the conversation happens in comments: a popular post gets hundreds.
        </p>
        <ul className="flex flex-col gap-1.5 pl-4 [list-style:disc]">
          <li>
            <strong className="text-foreground">Ask HN</strong> posts are
            questions to the community, like “Ask HN: How did you get your first
            10 customers?”. Few a week.
          </li>
          <li>
            <strong className="text-foreground">Show HN</strong> posts are
            founders showing what they built and asking for feedback. Hundreds a
            week; Greer collects them without keywords.
          </li>
          <li>
            <strong className="text-foreground">Comments</strong> are where
            people mention they&apos;re stuck, under someone else&apos;s post:
            “we launched 3 months ago and still have zero signups”.
          </li>
        </ul>
        <p>
          So use both kinds of keyword: one broad word for{" "}
          <strong className="text-foreground">Ask HN posts</strong>{" "}
          (“customers”), and specific phrases of 2 or 3 words for{" "}
          <strong className="text-foreground">All stories and comments</strong>{" "}
          (“no paying customers”). A single word there would match thousands of
          unrelated comments a week.
        </p>
        <p>
          Your account earns <strong className="text-foreground">karma</strong>{" "}
          when people upvote what you write. New accounts with little karma are
          watched more closely for spam, so Greer suggests a gentler pace until
          yours grows. Replies that genuinely help earn karma; self-promotion
          loses it.
        </p>
        <p>
          A keyword matches when a post or comment contains every one of its
          words. Greer checks every 15 minutes, keeps what fits your product,
          and never posts: you reply yourself, on Hacker News.
        </p>
      </div>
    </details>
  );
}
