import type { CatalogItem } from "./types";

export const CATALOG: Record<string, CatalogItem> = {
  "usb-c-cable": { id: "usb-c-cable", title: "USB-C cable (2 m)", category: "electronics", priceCents: 1200, currency: "USD" },
  "desk-lamp": { id: "desk-lamp", title: "Desk lamp", category: "home", priceCents: 3000, currency: "USD" },
  "headphones": { id: "headphones", title: "Wireless headphones", category: "electronics", priceCents: 8900, currency: "USD" },
  "gift-card-500": { id: "gift-card-500", title: "Gift card $500", category: "gift_cards", priceCents: 50000, currency: "USD" },
};
