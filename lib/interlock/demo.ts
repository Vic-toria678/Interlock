import { CATALOG } from "./catalog";
import { evaluate } from "./interlock";
import type { Mandate, Proposal } from "./types";

const mandate: Mandate = {
  currency: "USD",
  perOrderCapCents: 5000,
  weeklyCapCents: 12000,
  allowedCategories: ["electronics", "home"],
  approvalAboveCents: 2000,
};

const scenarios: { name: string; proposal: Proposal; spent?: number }[] = [
  { name: "Normal purchase", proposal: { itemId: "usb-c-cable", quantity: 1, amountCents: 1200, currency: "USD" } },
  { name: "Above approval threshold", proposal: { itemId: "desk-lamp", quantity: 1, amountCents: 3000, currency: "USD" } },
  { name: "Over per-order cap", proposal: { itemId: "headphones", quantity: 1, amountCents: 8900, currency: "USD" } },
  { name: "Tampered price (injection)", proposal: { itemId: "usb-c-cable", quantity: 1, amountCents: 4900, currency: "USD" } },
  { name: "Hostile gift card (injection)", proposal: { itemId: "gift-card-500", quantity: 1, amountCents: 50000, currency: "USD" } },
  { name: "Weekly cap exceeded", proposal: { itemId: "desk-lamp", quantity: 1, amountCents: 3000, currency: "USD" }, spent: 10000 },
];

for (const s of scenarios) {
  const d = evaluate(s.proposal, mandate, CATALOG, s.spent ?? 0);
  console.log(`\n${s.name} -> ${d.verdict.toUpperCase()}`);
  for (const c of d.checks.filter((c) => !c.passed)) console.log(`   x ${c.rule}: ${c.detail}`);
}
