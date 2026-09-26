import { promises as fs } from "node:fs";
import path from "node:path";

export type StoredSubscription = {
  userId: string;
  plan: "free" | "pro" | "team";
  status: "none" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodEnd?: string;
  updatedAt: string;
};

type BillingStore = {
  subscriptions: StoredSubscription[];
  processedEvents: string[];
};

const FILE = path.join(process.cwd(), ".data", "billing.json");

async function readRaw(): Promise<BillingStore> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as BillingStore;
    return {
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      processedEvents: Array.isArray(parsed.processedEvents) ? parsed.processedEvents : [],
    };
  } catch {
    return { subscriptions: [], processedEvents: [] };
  }
}

async function writeRaw(store: BillingStore) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function getSubscriptionForUser(userId: string) {
  const store = await readRaw();
  return store.subscriptions.find((row) => row.userId === userId) || null;
}

export async function upsertSubscription(next: StoredSubscription) {
  const store = await readRaw();
  const index = store.subscriptions.findIndex((row) => row.userId === next.userId);
  if (index >= 0) store.subscriptions[index] = next;
  else store.subscriptions.push(next);
  await writeRaw(store);
  return next;
}

export async function markBillingEventProcessed(eventId: string) {
  const store = await readRaw();
  if (store.processedEvents.includes(eventId)) return false;
  store.processedEvents.unshift(eventId);
  store.processedEvents = store.processedEvents.slice(0, 2000);
  await writeRaw(store);
  return true;
}
