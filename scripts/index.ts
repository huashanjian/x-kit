import accounts from "../dev-accounts.json" with { type: "json" };
import { xGuestClient } from "./utils.ts";
import { get } from "lodash";
import fs from "fs-extra";

interface Account {
  id?: string | null;
  username: string;
  twitter_url: string;
  description: string;
  tags: string[];
  enabled?: boolean;
  aliases?: string[];
  verifyStatus?: string;
  lastVerifiedAt?: string | null;
}

const REGISTRY_PATH = "./dev-accounts.json";

function readSavedUser(account: Account): any | null {
  const candidates = [account.username, ...(account.aliases || [])];
  for (const username of candidates) {
    const accountFile = `./accounts/${username}.json`;
    if (!fs.existsSync(accountFile)) continue;
    const data = JSON.parse(fs.readFileSync(accountFile, "utf-8"));
    const uid = get(data, "restId") || get(data, "data.user.restId");
    if (uid) return { username, data, uid };
  }
  return null;
}

async function fetchUser(client: any, username: string): Promise<any | null> {
  try {
    const user = await client.getUserApi().getUserByScreenName({ screenName: username });
    const userData = get(user, "data.user", {});
    if (Object.keys(userData).length === 0) return null;
    fs.ensureDirSync("./accounts");
    fs.writeFileSync(`./accounts/${username}.json`, JSON.stringify(userData, null, 2));
    return userData;
  } catch (error) {
    console.error(`Error fetching ${username}:`, error);
    return null;
  }
}

const mutableAccounts: Account[] = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
const client = await xGuestClient();
const today = new Date().toISOString().slice(0, 10);

let resolved = 0;
let unresolved = 0;
let skipped = 0;

for (const account of mutableAccounts) {
  if (account.enabled === false && !account.id) {
    skipped += 1;
    console.log(`${account.username} skipped: disabled and unresolved`);
    continue;
  }

  const saved = readSavedUser(account);
  if (saved) {
    account.id = saved.uid;
    account.verifyStatus = "verified";
    account.lastVerifiedAt = today;
    resolved += 1;
    console.log(`${account.username} resolved from accounts/${saved.username}.json`);
    continue;
  }

  const candidates = [account.username, ...(account.aliases || [])];
  let userData: any | null = null;
  let usedUsername = account.username;
  for (const username of candidates) {
    userData = await fetchUser(client, username);
    if (userData) {
      usedUsername = username;
      break;
    }
  }

  const uid = get(userData, "restId") || get(userData, "data.user.restId");
  if (uid) {
    account.id = uid;
    account.verifyStatus = "verified";
    account.lastVerifiedAt = today;
    resolved += 1;
    console.log(`${account.username} resolved via ${usedUsername}`);
  } else {
    account.id = account.id || null;
    account.verifyStatus = "unresolved";
    account.lastVerifiedAt = account.lastVerifiedAt || null;
    unresolved += 1;
    console.log(`${account.username} unresolved`);
  }
}

fs.writeFileSync(REGISTRY_PATH, JSON.stringify(mutableAccounts, null, 2) + "\n");
console.log(`\nResolved: ${resolved}; unresolved: ${unresolved}; skipped: ${skipped}`);
