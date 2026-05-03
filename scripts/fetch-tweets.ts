import { XAuthClient } from "./utils";
import { get } from "lodash";
import dayjs from "dayjs";
import fs from "fs-extra";
import path from "path";
import accounts from "../dev-accounts.json" with { type: "json" };
import type { TweetApiUtilsData } from "twitter-openapi-typescript";

interface Account {
  username: string;
  id?: string;
}

const client = await XAuthClient();

// Helper: fetch user tweets by userId
async function fetchUserTweets(userId: string): Promise<any[]> {
  try {
    const resp = await client.getTweetApi().getUserTweets({
      userId: userId,
    });
    return resp.data.data.filter((e) => !e.promotedMetadata) || [];
  } catch (e) {
    console.error(`Error fetching tweets for user ${userId}:`, e);
    return [];
  }
}

// Helper: resolve username to userId via saved account file or API
async function resolveUserId(account: Account): Promise<string | null> {
  if (account.id) return account.id;
  const accountFile = `./accounts/${account.username}.json`;
  if (fs.existsSync(accountFile)) {
    const data = JSON.parse(fs.readFileSync(accountFile, "utf-8"));
    const uid = get(data, "data.user.restId") || get(data, "restId");
    if (uid) return uid;
  }
  // Try API lookup
  try {
    const user = await client.getUserApi().getUserByScreenName({
      screenName: account.username,
    });
    const uid = get(user, "data.user.restId");
    if (uid) return uid;
  } catch (e) {
    console.error(`Could not resolve userId for ${account.username}:`, e);
  }
  return null;
}

// --- Phase 1: Fetch home timeline (as before) ---
const homeResp = await client.getTweetApi().getHomeLatestTimeline({
  count: 100,
});

const allTweets: any[] = [];

// Process home timeline tweets
const homeTweets = homeResp.data.data.filter((tweet) => {
  return !tweet.referenced_tweets || tweet.referenced_tweets.length === 0;
});

homeTweets.forEach((tweet) => {
  const isQuoteStatus = get(tweet, "raw.result.legacy.isQuoteStatus");
  if (isQuoteStatus) return;
  const fullText = get(tweet, "raw.result.legacy.fullText", "RT @");
  if (fullText?.includes("RT @")) return;
  const createdAt = get(tweet, "raw.result.legacy.createdAt");
  if (dayjs().diff(dayjs(createdAt), "day") > 1) return;
  
  const screenName = get(tweet, "user.legacy.screenName");
  allTweets.push({
    source: "home_timeline",
    username: screenName,
    tweetUrl: `https://x.com/${screenName}/status/${get(tweet, "raw.result.legacy.idStr")}`,
    fullText: fullText,
    createdAt: createdAt,
  });
});

console.log(`Home timeline: ${allTweets.length} tweets`);

// --- Phase 2: Fetch watchlist user tweets ---
const watchlist = accounts.filter((a: any) => 
  ["karpathy", "ylecun", "drfeifeifei", "chelseabfinn", "svlevine",
   "danijarhafner", "russtedrake", "shuran_song", "pulkitag", "joshua_b_tenenbaum"].includes(a.username)
);

for (const account of watchlist) {
  const userId = await resolveUserId(account);
  if (!userId) {
    console.log(`Skipping ${account.username}: no userId`);
    continue;
  }
  const tweets = await fetchUserTweets(userId);
  for (const tweet of tweets) {
    const fullText = get(tweet, "raw.result.legacy.fullText", "");
    if (fullText.includes("RT @")) continue;
    const createdAt = get(tweet, "raw.result.legacy.createdAt");
    if (dayjs().diff(dayjs(createdAt), "day") > 1) continue;
    
    const screenName = get(tweet, "user.legacy.screenName");
    allTweets.push({
      source: "watchlist",
      username: screenName,
      tweetUrl: `https://x.com/${screenName}/status/${get(tweet, "raw.result.legacy.idStr")}`,
      fullText: fullText,
      createdAt: createdAt,
    });
  }
  console.log(`${account.username}: ${tweets.length} tweets`);
}

// --- Phase 3: Dedup and output ---
const unique = Array.from(
  new Map(allTweets.map(t => [t.tweetUrl, t])).values()
);

unique.sort((a, b) => {
  const idA = a.tweetUrl.split('/').pop() || '';
  const idB = b.tweetUrl.split('/').pop() || '';
  return idB.localeCompare(idA);
});

const outputPath = `./tweets/${dayjs().format("YYYY-MM-DD")}.json`;
let existing: any[] = [];
if (fs.existsSync(outputPath)) {
  existing = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
}
const merged = Array.from(
  new Map([...existing, ...unique].map(t => [t.tweetUrl, t])).values()
);

fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));
console.log(`\nTotal unique tweets: ${merged.length} → ${outputPath}`);
