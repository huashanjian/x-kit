import { XAuthClient } from "./utils";
import { get } from "lodash";
import dayjs from "dayjs";
import fs from "fs-extra";
import accounts from "../dev-accounts.json" with { type: "json" };

interface Account {
  username: string;
  id?: string | null;
  tags?: string[];
  category?: string;
  priority?: string;
  enabled?: boolean;
  routeTo?: string[];
  aliases?: string[];
  verifyStatus?: string;
}

interface NormalizedTweet {
  source: string;
  username: string;
  tweetUrl: string;
  fullText: string;
  createdAt: string;
  category?: string;
  priority?: string;
  tags?: string[];
  routeTo?: string[];
}

interface Failure {
  username: string;
  stage: string;
  error: string;
}

const runStartedAt = new Date();
const failures: Failure[] = [];
const client = await XAuthClient();
const registryAccounts = accounts as Account[];
const accountLookup = new Map<string, Account>();

for (const account of registryAccounts) {
  const keys = [account.username, ...(account.aliases || [])];
  for (const key of keys) {
    accountLookup.set(key.toLowerCase(), account);
  }
}

function lookupAccount(username?: string): Account | undefined {
  if (!username) return undefined;
  return accountLookup.get(username.toLowerCase());
}

function shouldKeepTweet(tweet: any): boolean {
  const fullText = get(tweet, "raw.result.legacy.fullText", "");
  const createdAt = get(tweet, "raw.result.legacy.createdAt");
  const isQuoteStatus = get(tweet, "raw.result.legacy.isQuoteStatus");
  if (!fullText || fullText.includes("RT @") || isQuoteStatus) return false;
  if (!createdAt || dayjs().diff(dayjs(createdAt), "day") > 1) return false;
  return true;
}

function normalizeTweet(tweet: any, source: string, account?: Account): NormalizedTweet | null {
  if (!shouldKeepTweet(tweet)) return null;
  const username = get(tweet, "user.legacy.screenName") || account?.username;
  const tweetId = get(tweet, "raw.result.legacy.idStr");
  if (!username || !tweetId) return null;
  const matchedAccount = account || lookupAccount(username);

  return {
    source,
    username,
    tweetUrl: `https://x.com/${username}/status/${tweetId}`,
    fullText: get(tweet, "raw.result.legacy.fullText", ""),
    createdAt: get(tweet, "raw.result.legacy.createdAt", ""),
    category: matchedAccount?.category,
    priority: matchedAccount?.priority,
    tags: matchedAccount?.tags,
    routeTo: matchedAccount?.routeTo,
  };
}

function readSavedUserId(account: Account): string | null {
  const candidates = [account.username, ...(account.aliases || [])];
  for (const username of candidates) {
    const accountFile = `./accounts/${username}.json`;
    if (!fs.existsSync(accountFile)) continue;
    const data = JSON.parse(fs.readFileSync(accountFile, "utf-8"));
    const uid = get(data, "restId") || get(data, "data.user.restId");
    if (uid) return uid;
  }
  return null;
}

async function resolveUserId(account: Account): Promise<string | null> {
  if (account.id) return account.id;

  const savedUid = readSavedUserId(account);
  if (savedUid) return savedUid;

  const candidates = [account.username, ...(account.aliases || [])];
  for (const username of candidates) {
    try {
      const user = await client.getUserApi().getUserByScreenName({ screenName: username });
      const userData = get(user, "data.user", {});
      const uid = get(userData, "restId") || get(userData, "data.user.restId");
      if (uid) {
        fs.ensureDirSync("./accounts");
        fs.writeFileSync(`./accounts/${username}.json`, JSON.stringify(userData, null, 2));
        return uid;
      }
    } catch (error) {
      failures.push({
        username: account.username,
        stage: `resolve:${username}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return null;
}

async function fetchUserTweets(account: Account, userId: string): Promise<any[]> {
  try {
    const resp = await client.getTweetApi().getUserTweets({ userId });
    return (resp.data.data || []).filter((tweet: any) => !tweet.promotedMetadata);
  } catch (error) {
    failures.push({
      username: account.username,
      stage: "fetch-user-tweets",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

const allTweets: NormalizedTweet[] = [];
let homeTweetCount = 0;
let resolvedAccounts = 0;
let unresolvedAccounts = 0;
let fetchedAccounts = 0;
let skippedAccounts = 0;

try {
  const homeResp = await client.getTweetApi().getHomeLatestTimeline({ count: 100 });
  const homeTweets = (homeResp.data.data || []).filter((tweet: any) => {
    return !tweet.referenced_tweets || tweet.referenced_tweets.length === 0;
  });

  for (const tweet of homeTweets) {
    const normalized = normalizeTweet(tweet, "home_timeline");
    if (!normalized) continue;
    allTweets.push(normalized);
    homeTweetCount += 1;
  }
  console.log(`Home timeline: ${homeTweetCount} tweets`);
} catch (error) {
  failures.push({
    username: "home_timeline",
    stage: "fetch-home-timeline",
    error: error instanceof Error ? error.message : String(error),
  });
}

const enabledAccounts = registryAccounts.filter((account) => account.enabled !== false);
const researchAccounts = enabledAccounts.filter((account) => account.routeTo?.includes("research_x"));

for (const account of researchAccounts) {
  const userId = await resolveUserId(account);
  if (!userId) {
    unresolvedAccounts += 1;
    console.log(`Skipping ${account.username}: no userId`);
    continue;
  }

  resolvedAccounts += 1;
  const tweets = await fetchUserTweets(account, userId);
  fetchedAccounts += 1;

  let kept = 0;
  for (const tweet of tweets) {
    const normalized = normalizeTweet(tweet, "watchlist", account);
    if (!normalized) continue;
    allTweets.push(normalized);
    kept += 1;
  }
  console.log(`${account.username}: ${kept}/${tweets.length} tweets kept`);
}

skippedAccounts = registryAccounts.filter((account) => account.enabled === false).length;

const unique = Array.from(new Map(allTweets.map((tweet) => [tweet.tweetUrl, tweet])).values());
unique.sort((a, b) => {
  const idA = a.tweetUrl.split("/").pop() || "";
  const idB = b.tweetUrl.split("/").pop() || "";
  return idB.localeCompare(idA);
});

const dateStr = dayjs().format("YYYY-MM-DD");
const outputPath = `./tweets/${dateStr}.json`;
let existing: NormalizedTweet[] = [];
if (fs.existsSync(outputPath)) {
  existing = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
}

const merged = Array.from(new Map([...existing, ...unique].map((tweet) => [tweet.tweetUrl, tweet])).values()).map(
  (tweet) => {
    const account = lookupAccount(tweet.username);
    if (!account) return tweet;
    return {
      ...tweet,
      category: tweet.category || account.category,
      priority: tweet.priority || account.priority,
      tags: tweet.tags || account.tags,
      routeTo: tweet.routeTo || account.routeTo,
    };
  },
);
merged.sort((a, b) => {
  const idA = a.tweetUrl.split("/").pop() || "";
  const idB = b.tweetUrl.split("/").pop() || "";
  return idB.localeCompare(idA);
});

fs.ensureDirSync("./tweets");
fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2) + "\n");

const researchTweets = merged.filter((tweet) => tweet.routeTo?.includes("research_x")).length;
const status = {
  schema: "x-kit-fetch-status-v1",
  date: dateStr,
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - runStartedAt.getTime(),
  accounts: {
    registryTotal: registryAccounts.length,
    enabledTotal: enabledAccounts.length,
    researchEnabled: researchAccounts.length,
    resolved: resolvedAccounts,
    unresolved: unresolvedAccounts,
    fetched: fetchedAccounts,
    skipped: skippedAccounts,
    failed: failures.length,
  },
  tweets: {
    homeAdded: homeTweetCount,
    runUnique: unique.length,
    mergedTotal: merged.length,
    researchTweets,
  },
  failures,
};

fs.ensureDirSync("./_status");
fs.writeFileSync(`./_status/${dateStr}.json`, JSON.stringify(status, null, 2) + "\n");

console.log(`\nTotal unique tweets: ${merged.length} -> ${outputPath}`);
console.log(`Status: ./_status/${dateStr}.json`);
