import { parse } from "csv-parse/sync";
import fs from "fs-extra";
import accounts from "../dev-accounts.json" with { type: "json" };

interface RegistryAccount {
  username: string;
  twitter_url: string;
  description: string;
  tags: string[];
  id?: string | null;
  category?: string;
  priority?: string;
  enabled?: boolean;
  routeTo?: string[];
  aliases?: string[];
  lastVerifiedAt?: string | null;
  verifyStatus?: string;
  displayName?: string;
  notes?: string;
}

interface FollowingRow {
  name: string;
  user_name: string;
  user_id: string;
  bio: string;
  followers_count: string;
  profile_url: string;
  verified: string;
  is_blue_verified: string;
}

const args = process.argv.slice(2);
const csvPath = args.find((arg) => !arg.startsWith("--"));
const apply = args.includes("--apply");
const enableMatched = args.includes("--enable-matched");
const today = new Date().toISOString().slice(0, 10);

if (!csvPath) {
  console.error("Usage: bun run scripts/import-following.ts <following.csv> [--apply] [--enable-matched]");
  process.exit(1);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function inferAccount(row: FollowingRow): Pick<RegistryAccount, "category" | "priority" | "routeTo" | "tags"> {
  const text = `${row.name} ${row.user_name} ${row.bio}`.toLowerCase();
  const tags: string[] = [];

  const embodiedPatterns = [
    /robot/,
    /robotics/,
    /embodied/,
    /physical ai/,
    /manipulation/,
    /humanoid/,
    /spatial/,
    /world model/,
    /\bvla\b/,
    /reinforcement learning/,
    /\brl\b/,
    /skild/,
    /genesis ai/,
    /physical intelligence/,
  ];
  const aiPatterns = [
    /artificial intelligence/,
    /\bai\b/,
    /machine learning/,
    /deep learning/,
    /foundation model/,
    /anthropic/,
    /openai/,
    /deepmind/,
    /nvidia/,
    /stanford ai/,
    /mit csail/,
  ];
  const builderPatterns = [
    /founder/,
    /startup/,
    /builder/,
    /product/,
    /engineer/,
    /developer/,
    /agent/,
    /saas/,
    /venture/,
    /capital/,
  ];

  if (hasAny(text, embodiedPatterns)) tags.push("embodied-ai");
  if (/world model/.test(text)) tags.push("world-models");
  if (/\bvla\b/.test(text)) tags.push("vla");
  if (/reinforcement learning|\brl\b/.test(text)) tags.push("rl");
  if (/robot|robotics|manipulation|humanoid|physical ai/.test(text)) tags.push("robotics");
  if (/agent/.test(text)) tags.push("agent");
  if (/anthropic|openai|deepmind|google ai|nvidia|huggingface/.test(text)) tags.push("ai-lab");
  if (/founder|startup|venture|capital/.test(text)) tags.push("builder");

  const category = hasAny(text, embodiedPatterns) || hasAny(text, aiPatterns) ? "research" : hasAny(text, builderPatterns) ? "builder" : "following";
  const priority = hasAny(text, embodiedPatterns) ? "P1" : category === "research" ? "P2" : "P2";
  const routeTo = category === "research" ? ["builders", "research_x"] : category === "builder" ? ["builders"] : ["candidate"];

  return { category, priority, routeTo, tags: uniq(tags) };
}

function toAccount(row: FollowingRow): RegistryAccount {
  const inferred = inferAccount(row);
  return {
    username: row.user_name,
    twitter_url: row.profile_url || `https://x.com/${row.user_name}`,
    description: row.bio || row.name,
    tags: inferred.tags,
    id: row.user_id || null,
    category: inferred.category,
    priority: inferred.priority,
    enabled: false,
    routeTo: inferred.routeTo,
    aliases: [],
    lastVerifiedAt: row.user_id ? today : null,
    verifyStatus: row.user_id ? "verified" : "unresolved",
    displayName: row.name,
    notes: "Imported from local following CSV; enable manually after review.",
  };
}

const registry = accounts as RegistryAccount[];
const registryByName = new Map<string, RegistryAccount>();
for (const account of registry) {
  registryByName.set(account.username.toLowerCase(), account);
  for (const alias of account.aliases || []) {
    registryByName.set(alias.toLowerCase(), account);
  }
}

const csv = fs.readFileSync(csvPath, "utf-8");
const rows = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  bom: true,
}) as FollowingRow[];

const additions: RegistryAccount[] = [];
const updates: string[] = [];

for (const row of rows) {
  const username = row.user_name?.trim();
  if (!username) continue;

  const existing = registryByName.get(username.toLowerCase());
  if (existing) {
    let changed = false;
    if (!existing.id && row.user_id) {
      existing.id = row.user_id;
      existing.verifyStatus = "verified";
      existing.lastVerifiedAt = today;
      changed = true;
    }
    if (!existing.displayName && row.name) {
      existing.displayName = row.name;
      changed = true;
    }
    if (enableMatched && existing.category === "research") {
      existing.enabled = true;
      changed = true;
    }
    if (changed) updates.push(existing.username);
    continue;
  }

  additions.push(toAccount(row));
}

const summary = {
  csvPath,
  rows: rows.length,
  existingMatches: rows.length - additions.length,
  additions: additions.length,
  updates: updates.length,
  byCategory: additions.reduce<Record<string, number>>((acc, account) => {
    acc[account.category || "unknown"] = (acc[account.category || "unknown"] || 0) + 1;
    return acc;
  }, {}),
  suggestedReview: additions
    .filter((account) => account.category === "research")
    .slice(0, 40)
    .map((account) => ({
      username: account.username,
      displayName: account.displayName,
      priority: account.priority,
      tags: account.tags,
      followers: rows.find((row) => row.user_name === account.username)?.followers_count,
      description: account.description,
    })),
};

if (apply) {
  registry.push(...additions);
  fs.writeFileSync("./dev-accounts.json", JSON.stringify(registry, null, 2) + "\n");
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...summary }, null, 2));
