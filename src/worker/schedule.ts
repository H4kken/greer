// How often Greer checks its sources. The worker schedules itself from this,
// and Today uses it to say when the next check is.
export const INGEST_EVERY_MINUTES = 15;
export const INGEST_CRON = `*/${INGEST_EVERY_MINUTES} * * * *`;

// Cron runs on the quarter hour, so the next check is the next one.
export function nextIngestAt(now = new Date()): Date {
  const step = INGEST_EVERY_MINUTES * 60_000;
  return new Date(Math.floor(now.getTime() / step) * step + step);
}
