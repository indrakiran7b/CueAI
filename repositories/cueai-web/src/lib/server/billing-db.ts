import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type DbBillingSubscription = {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string;
  planId: string;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DbBillingPayment = {
  id: string;
  userId: string;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
};

export type BillingStore = {
  subscriptions: DbBillingSubscription[];
  payments: DbBillingPayment[];
  processedEventIds: string[];
};

const DATA_DIR = process.env.CUEAI_DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "billing-store.json");

let memory: BillingStore | null = null;
let loadedMtimeMs = 0;
let writeQueue: Promise<void> = Promise.resolve();

function defaultStore(): BillingStore {
  return { subscriptions: [], payments: [], processedEventIds: [] };
}

async function storeFileMtime(): Promise<number> {
  try {
    return (await fs.stat(STORE_PATH)).mtimeMs;
  } catch {
    return 0;
  }
}

async function persist(store: BillingStore) {
  memory = store;
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Keep processed events bounded
    store.processedEventIds = store.processedEventIds.slice(-2000);
    store.payments = store.payments.slice(0, 2000);
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
    loadedMtimeMs = await storeFileMtime();
  });
  await writeQueue;
}

async function ensureLoaded(): Promise<BillingStore> {
  const mtime = await storeFileMtime();
  if (memory && mtime && loadedMtimeMs && mtime <= loadedMtimeMs) return memory;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(STORE_PATH, "utf8");
    memory = JSON.parse(raw) as BillingStore;
    loadedMtimeMs = mtime || Date.now();
    if (!memory.subscriptions) memory.subscriptions = [];
    if (!memory.payments) memory.payments = [];
    if (!memory.processedEventIds) memory.processedEventIds = [];
    return memory;
  } catch {
    memory = defaultStore();
    await persist(memory);
    return memory;
  }
}

export async function readBillingStore() {
  return ensureLoaded();
}

export async function updateBillingStore(
  mutator: (store: BillingStore) => void | Promise<void>,
) {
  const store = await ensureLoaded();
  await mutator(store);
  await persist(store);
  return store;
}

export function newBillingId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 12)}`;
}

export function invalidateBillingStoreCache() {
  memory = null;
  loadedMtimeMs = 0;
}
