// The contract every platform adapter implements (see the add-source skill).
// Adapters are read-only: no posting, voting or messaging, ever.

export type Platform = "hn";

export type ItemType = "story" | "comment";

// A post or comment, normalized from the platform's payload.
export type RawItem = {
  externalId: string; // stable platform id
  type: ItemType;
  author: string;
  title: string; // the story title (for comments: their thread's title)
  text: string; // plain text body
  url: string; // canonical permalink
  threadId: string; // external id of the root story
  createdAt: Date; // UTC
  raw: unknown; // original payload, kept for debugging and re-normalizing
};

// What an adapter needs to run one saved query.
export type SourceQuery = {
  query: string; // search words; empty = everything in `section`
  section: string; // platform-specific scope, e.g. HN "ask_hn"
};

export type ThreadNode = {
  externalId: string;
  author: string | null;
  text: string;
  createdAt: Date;
  children: ThreadNode[];
};

export type Thread = {
  externalId: string;
  title: string;
  url: string;
  root: ThreadNode;
};

export type AccountProfile = {
  handle: string;
  createdAt: Date;
  karma: number;
};

export type ItemStatus = "live" | "dead" | "deleted" | "missing";

// A comment the user wrote, and where it sits: what it answers and in which
// thread. Found from the user's public profile, never by logging in.
export type UserComment = {
  externalId: string;
  parentId: string; // the post or comment it replies to
  threadId: string; // external id of the root story
  threadTitle: string;
  text: string; // plain text
  url: string;
  createdAt: Date; // UTC
  raw: unknown;
};

export interface Source {
  platform: Platform;
  fetchNew(query: SourceQuery, since: Date): Promise<RawItem[]>;
  fetchThread(externalId: string): Promise<Thread>;
  permalink(externalId: string): string;
  fetchAccount?(handle: string): Promise<AccountProfile | null>;
  itemStatus?(externalId: string): Promise<ItemStatus>;
  // The user's own comments since a date, newest first.
  fetchUserComments?(handle: string, since: Date): Promise<UserComment[]>;
}
