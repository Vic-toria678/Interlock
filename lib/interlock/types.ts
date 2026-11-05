export type Cents = number;

export type CatalogItem = {
  id: string;
  title: string;
  category: string;
  priceCents: Cents;
  currency: string;
};

export type Mandate = {
  currency: string;
  perOrderCapCents: Cents;
  weeklyCapCents: Cents;
  allowedCategories: string[];
  approvalAboveCents: Cents;
};

export type Proposal = {
  itemId: string;
  quantity: number;
  amountCents: Cents;
  currency: string;
};

export type Verdict = "allow" | "needs_approval" | "block";

export type Check = { rule: string; passed: boolean; detail: string };

export type Decision = { verdict: Verdict; checks: Check[] };
