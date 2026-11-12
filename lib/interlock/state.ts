import type { Cents, Check, Mandate, Proposal } from "./types";

export type PendingOrder = {
  orderId: string;
  itemId: string;
  quantity: number;
  amountCents: Cents;
  status: "pending" | "captured";
};

export type AuditEntry = {
  at: string;
  proposal: Proposal;
  verdict: string;
  checks: Check[];
  note: string;
};

type Store = { spentCents: Cents; pending: Map<string, PendingOrder>; audit: AuditEntry[] };

const g = globalThis as unknown as { __interlockStore?: Store; __interlockMandate?: Mandate };

export const store: Store = (g.__interlockStore ??= {
  spentCents: 0,
  pending: new Map(),
  audit: [],
});

export const DEFAULT_MANDATE: Mandate = {
  currency: "USD",
  perOrderCapCents: 5000,
  weeklyCapCents: 12000,
  allowedCategories: ["electronics", "home"],
  approvalAboveCents: 2000,
};

export const mandate: Mandate = (g.__interlockMandate ??= {
  ...DEFAULT_MANDATE,
  allowedCategories: [...DEFAULT_MANDATE.allowedCategories],
});
