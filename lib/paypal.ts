const BASE = "https://api-m.sandbox.paypal.com";

type PayPalResponse = {
  id?: string;
  status?: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
  name?: string;
  message?: string;
};

async function getAccessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env.local");
  }
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status}). Check your sandbox credentials.`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function createOrder(opts: {
  amountCents: number;
  description: string;
  referenceId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.referenceId,
          description: opts.description,
          amount: { currency_code: "USD", value: (opts.amountCents / 100).toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: opts.returnUrl,
            cancel_url: opts.cancelUrl,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as PayPalResponse;
  if (!res.ok || !data.id) {
    throw new Error(`PayPal create order failed (${res.status}): ${data.message ?? data.name ?? "unknown error"}`);
  }
  const approveUrl = data.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return { orderId: data.id, status: data.status, approveUrl };
}

export async function captureOrder(orderId: string) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const data = (await res.json()) as PayPalResponse;
  if (!res.ok) {
    throw new Error(`PayPal capture failed (${res.status}): ${data.message ?? data.name ?? "unknown error"}`);
  }
  return { status: data.status, captureId: data.purchase_units?.[0]?.payments?.captures?.[0]?.id };
}
