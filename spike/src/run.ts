// Milestone 0 spike: fetch HN → prefilter → score → top N (+ a few briefs) → report.
// Usage: pnpm start [--days 30] [--max 300] [--top 20] [--briefs 3] [--dry-run]
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { briefFor, pasteReadyWarnings, PROMPT_VERSION as BRIEF_VERSION, type Brief } from './brief.ts';
import { MODELS, QUERIES } from './config.ts';
import { searchQuery } from './hn.ts';
import { costReport, pool } from './llm.ts';
import { capFairly, prefilter } from './prefilter.ts';
import { PROMPT_VERSION as SCORE_VERSION, scoreItem, type Scored } from './score.ts';

const { values: args } = parseArgs({
  options: {
    days: { type: 'string', default: '30' },
    'per-query': { type: 'string', default: '100' },
    max: { type: 'string', default: '300' },
    top: { type: 'string', default: '20' },
    briefs: { type: 'string', default: '3' },
    concurrency: { type: 'string', default: '5' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const days = Number(args.days);
const max = Number(args.max);
const top = Number(args.top);
const briefCount = Number(args.briefs);

const outDir = join('out', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(outDir, { recursive: true });
const save = (name: string, data: unknown) => writeFileSync(join(outDir, name), JSON.stringify(data, null, 2));

// 1. Fetch
console.log(`Fetching ${QUERIES.length} queries (last ${days} days)…`);
const batches = [];
for (const q of QUERIES) {
  const items = await searchQuery(q, days, Number(args['per-query']));
  console.log(`  ${q.label.padEnd(20)} ${items.length}`);
  batches.push(items);
}

// 2. Prefilter + fair cap
const { items: filtered, stats } = prefilter(batches);
const candidates = capFairly(filtered, max);
console.log(
  `\nFetched ${stats.fetched} → ${stats.unique} unique → ${stats.kept} after prefilter ` +
    `(${stats.tooShort} too short, ${stats.skippedThread} hiring threads, ${stats.dead} dead) → ${candidates.length} to score`,
);
save('candidates.json', candidates);

if (args['dry-run']) {
  console.log(`\nDry run: no LLM calls. Candidates saved to ${outDir}/candidates.json`);
  process.exit(0);
}

// 3. Score
console.log(`\nScoring with ${MODELS.score}…`);
let done = 0;
let scored: Scored[];
try {
  scored = await pool(candidates, Number(args.concurrency), async (item) => {
    const result = await scoreItem(item);
    if (++done % 25 === 0 || done === candidates.length) console.log(`  ${done}/${candidates.length}`);
    return result;
  });
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error('\nAuthentication failed: set ANTHROPIC_API_KEY (e.g. in spike/.env) and run again.');
    process.exit(1);
  }
  throw error;
}
save('scored.json', scored);

const ok = scored.filter((s) => s.score).sort((a, b) => b.score!.relevance - a.score!.relevance);
const failed = scored.filter((s) => !s.score);
const topItems = ok.slice(0, top);

// 4. Briefs for the very top items
const briefs = new Map<string, Brief | { error: string }>();
if (briefCount > 0 && topItems.length) {
  console.log(`\nWriting ${Math.min(briefCount, topItems.length)} briefs with ${MODELS.brief}…`);
  for (const item of topItems.slice(0, briefCount)) briefs.set(item.id, await briefFor(item));
  save('briefs.json', Object.fromEntries(briefs));
}

// 5. Report
const bucket = (lo: number, hi: number) => ok.filter((s) => s.score!.relevance >= lo && s.score!.relevance <= hi).length;
const intents = new Map<string, number>();
for (const s of ok) intents.set(s.score!.intent, (intents.get(s.score!.intent) ?? 0) + 1);
const perQuery = new Map<string, { n: number; high: number }>();
for (const s of ok)
  for (const q of s.queries) {
    const cur = perQuery.get(q) ?? { n: 0, high: 0 };
    cur.n++;
    if (s.score!.relevance >= 70) cur.high++;
    perQuery.set(q, cur);
  }
const cost = costReport();
const oneLine = (t: string, n = 280) => t.replace(/\s+/g, ' ').slice(0, n) + (t.length > n ? '…' : '');

const md: string[] = [
  `# Greer spike report`,
  ``,
  `${new Date().toISOString().slice(0, 16)} · last ${days} days · prompts: ${SCORE_VERSION}, ${BRIEF_VERSION}`,
  ``,
  `## How to review`,
  ``,
  `For each thread below, tick the box if you would genuinely have wanted to reply. The share of ticked boxes in the top ${top} is the spike's main result.`,
  ``,
  `## Funnel`,
  ``,
  `| Step | Count |`,
  `|---|---|`,
  `| Fetched (all queries) | ${stats.fetched} |`,
  `| Unique | ${stats.unique} |`,
  `| After prefilter | ${stats.kept} |`,
  `| Scored | ${ok.length} (${failed.length} failed) |`,
  `| Relevance ≥ 80 / 50–79 / 20–49 / < 20 | ${bucket(80, 100)} / ${bucket(50, 79)} / ${bucket(20, 49)} / ${bucket(0, 19)} |`,
  ``,
  `**Intents:** ${[...intents].map(([k, v]) => `${k} ${v}`).join(' · ')}`,
  ``,
  `**Queries (scored → relevance ≥ 70):** ${[...perQuery].sort((a, b) => b[1].high - a[1].high).map(([k, v]) => `${k} ${v.n}→${v.high}`).join(' · ')}`,
  ``,
  `**Cost:** ~$${cost.total.toFixed(2)} (${cost.lines.join('; ')})`,
  ``,
  `## Top ${topItems.length}`,
  ``,
];

topItems.forEach((s, i) => {
  const sc = s.score!;
  md.push(
    `### ${i + 1}. [${sc.relevance}] ${oneLine(s.title || '(untitled)', 100)}`,
    ``,
    `- [ ] I would reply to this`,
    `- ${s.type} by **${s.author}** · ${s.createdAt.slice(0, 10)} · ${sc.intent} · help without pitch: ${sc.can_help_without_pitch ? 'yes' : 'no'} · matched: ${s.queries.join(', ')}`,
    `- **Why:** ${sc.reason}`,
    `- ${s.url}`,
    ``,
    `> ${oneLine(s.text || s.title)}`,
    ``,
  );
  const brief = briefs.get(s.id);
  if (brief && 'error' in brief) md.push(`**Brief failed:** ${brief.error}`, ``);
  else if (brief) {
    const warnings = pasteReadyWarnings(brief);
    md.push(
      `<details><summary><b>Reply brief</b>${warnings.length ? ` ⚠️ ${warnings.length} note(s) look paste-ready` : ''}</summary>`,
      ``,
      `- **Need:** ${brief.need}`,
      `- **Already said:** ${brief.already_said.join(' · ') || '—'}`,
      `- **Angles:** ${brief.angles.join(' · ')}`,
      `- **From your experience:** ${brief.experience_prompts.join(' · ')}`,
      `- **Questions to ask:** ${brief.questions_to_ask.join(' · ') || '—'}`,
      `- **Mention Greer?** ${brief.mention_product.ok ? 'yes' : 'no'}: ${brief.mention_product.reason}`,
      warnings.length ? `- ⚠️ ${warnings.map((w) => `"${w}"`).join(', ')}` : '',
      ``,
      `</details>`,
      ``,
    );
  }
});

if (failed.length) {
  md.push(`## Failures`, ``, ...failed.slice(0, 20).map((f) => `- ${f.url}: ${f.error}`), ``);
}

writeFileSync(join(outDir, 'report.md'), md.join('\n'));
console.log(`\n${cost.lines.join('\n')}\nTotal ~$${cost.total.toFixed(2)}`);
console.log(`\nReport: ${join(outDir, 'report.md')}`);
