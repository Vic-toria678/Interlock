import type { CatalogItem, Check, Cents, Decision, Mandate, Proposal } from "./types";

const usd = (c: Cents) => `$${(c / 100).toFixed(2)}`;

export function evaluate(
  proposal: Proposal,
  mandate: Mandate,
  catalog: Record<string, CatalogItem>,
  spentThisWeekCents: Cents
): Decision {
  const checks: Check[] = [];
  const add = (rule: string, passed: boolean, detail: string) =>
    checks.push({ rule, passed, detail });

  const item = catalog[proposal.itemId];
  add(
    "known_item",
    Boolean(item),
    item ? `Found "${item.title}" in the trusted catalog` : `"${proposal.itemId}" is not in the trusted catalog`
  );
  if (!item) return { verdict: "block", checks };

  const validQty =
    Number.isInteger(proposal.quantity) && proposal.quantity >= 1 && proposal.quantity <= 10;
  add("quantity_valid", validQty, `Quantity ${proposal.quantity} (allowed: whole number 1-10)`);

  const expected = item.priceCents * proposal.quantity;
  add(
    "price_integrity",
    proposal.amountCents === expected,
    `Order is ${usd(proposal.amountCents)}, catalog total is ${usd(expected)}`
  );

  add(
    "currency",
    proposal.currency === mandate.currency && item.currency === mandate.currency,
    `Mandate currency is ${mandate.currency}`
  );

  add(
    "category",
    mandate.allowedCategories.includes(item.category),
    `Category "${item.category}" (allowed: ${mandate.allowedCategories.join(", ")})`
  );

  add(
    "per_order_cap",
    proposal.amountCents <= mandate.perOrderCapCents,
    `${usd(proposal.amountCents)} vs per-order cap ${usd(mandate.perOrderCapCents)}`
  );

  add(
    "weekly_cap",
    spentThisWeekCents + proposal.amountCents <= mandate.weeklyCapCents,
    `${usd(spentThisWeekCents)} already spent + ${usd(proposal.amountCents)} vs weekly cap ${usd(mandate.weeklyCapCents)}`
  );

  if (checks.some((c) => !c.passed)) return { verdict: "block", checks };

  if (proposal.amountCents > mandate.approvalAboveCents) {
    add(
      "approval_threshold",
      true,
      `${usd(proposal.amountCents)} is above ${usd(mandate.approvalAboveCents)}: the user must confirm`
    );
    return { verdict: "needs_approval", checks };
  }
  return { verdict: "allow", checks };
}
