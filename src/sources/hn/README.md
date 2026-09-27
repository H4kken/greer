# Hacker News source

**Access (checked 2026-09-27):** official, public, read-only APIs. No credentials, no login.

| API                                                                               | Used for                                               | Limits                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [Algolia HN Search](https://hn.algolia.com/api) `search_by_date`, `items/:id`     | Keyword search over stories and comments; full threads | Not verified (the docs page didn't load when checked); commonly cited as 10,000 requests/hour per IP. |
| [Official Firebase API](https://github.com/HackerNews/API) `user/:id`, `item/:id` | Account age and karma; `dead` / `deleted` flags        | "There is currently no rate limit."                                                                   |

**Our volume:** one request per saved query every 15 minutes (more only when a poll spans several result pages), e.g. ~14 queries → ~60 requests/hour. Requests to each host are spaced by the shared client in `src/sources/http.ts`, which also retries 429/5xx with backoff.

**Sections** (`SourceQuery.section`): `story_comment` (stories and comments), `story`, `ask_hn`, `show_hn`. They map to Algolia `tags`.

Read-only by design: this adapter never posts, votes or logs in.
