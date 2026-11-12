"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Check = { rule: string; passed: boolean; detail: string };
type Mandate = {
  currency: string;
  perOrderCapCents: number;
  weeklyCapCents: number;
  allowedCategories: string[];
  approvalAboveCents: number;
};
type AuditEntry = {
  at: string;
  proposal: { itemId: string; quantity: number; amountCents: number };
  verdict: string;
  checks: Check[];
  note: string;
};
type Outcome = {
  id: number;
  source: string;
  itemId: string;
  quantity: number;
  amountCents: number;
  verdict: string;
  paypalCalled: boolean;
  failed: string[];
  approveUrl?: string;
};
type AgentAttempt = {
  itemId: string;
  quantity: number;
  claimedAmountCents: number;
  verdict: string;
  paypalCalled: boolean;
  failedChecks: string[];
  approveUrl?: string;
};
type Chat = { role: "you" | "assistant"; text: string };
type RobotMood = "idle" | "happy" | "sad";
type LockMood = "idle" | "stop" | "ok";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const CATEGORIES = ["electronics", "home", "gift_cards"];
const JSON_HEADERS = { "Content-Type": "application/json" };

const ITEM_NAMES: Record<string, string> = {
  "usb-c-cable": "USB-C cable",
  "desk-lamp": "Desk lamp",
  headphones: "Wireless headphones",
  "gift-card-500": "$500 gift card",
};
const itemName = (id: string) => ITEM_NAMES[id] ?? id;

const RULE_LABELS: Record<string, string> = {
  known_item: "That item is not in the store catalog",
  quantity_valid: "The quantity looks wrong",
  price_integrity: "The price does not match the catalog",
  currency: "Wrong currency",
  category: "That category is not allowed",
  per_order_cap: "Over your per-order limit",
  weekly_cap: "Would go over your weekly limit",
};

function explain(f: string) {
  const i = f.indexOf(": ");
  if (i > 0 && RULE_LABELS[f.slice(0, i)]) {
    return { title: RULE_LABELS[f.slice(0, i)], detail: f.slice(i + 2) };
  }
  return { title: "", detail: f };
}

type Look = { label: string; word: string; stamp: string };
const STYLE: Record<string, Look> = {
  allow: { label: "✓ Approved", word: "APPROVED", stamp: "bg-violet-300 text-black" },
  needs_approval: { label: "Needs your OK", word: "ASK ME", stamp: "bg-[#FFD94A] text-black" },
  block: { label: "✕ Blocked", word: "BLOCKED", stamp: "bg-black text-white" },
  paid: { label: "Paid", word: "PAID", stamp: "bg-white text-black" },
};
const styleFor = (v: string): Look =>
  STYLE[v] ?? { label: v, word: v.toUpperCase(), stamp: "bg-white text-black" };

const toDraft = (m: Mandate) => ({
  perOrder: m.perOrderCapCents / 100,
  weekly: m.weeklyCapCents / 100,
  approval: m.approvalAboveCents / 100,
  cats: m.allowedCategories,
});

const PRESETS = [
  { label: "Buy a USB-C cable", msg: "I need a USB-C cable, please buy one", naive: false },
  { label: "Buy the headphones", msg: "Please buy the wireless headphones", naive: false },
  { label: "Read the lamp page (hidden trick)", msg: "Read the desk lamp page and tell me what it says", naive: true },
];

const TICKER = [
  "The AI proposes",
  "Interlock decides",
  "PayPal is only called when your rules say yes",
  "Sandbox only, no real money",
];

/* ---------- Cartoon characters ---------- */

function Robot({ mood = "idle" }: { mood?: RobotMood }) {
  const mouth =
    mood === "sad" ? "M48 68 Q60 60 72 68" : mood === "happy" ? "M46 60 Q60 76 74 60" : "M50 62 Q60 69 70 62";
  return (
    <svg viewBox="0 0 120 130" className="h-full w-full" aria-hidden="true">
      <g stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="60" y1="20" x2="60" y2="9" />
        <circle cx="60" cy="7" r="5" fill="#FFD94A" className="ch-ping" />
        <rect x="14" y="36" width="10" height="20" rx="5" fill="#C4B5FD" />
        <rect x="96" y="36" width="10" height="20" rx="5" fill="#C4B5FD" />
        <rect x="24" y="20" width="72" height="62" rx="20" fill="#fff" />
        <circle cx="45" cy="44" r="6" fill="#000" stroke="none" className="ch-blink" />
        <circle cx="75" cy="44" r="6" fill="#000" stroke="none" className="ch-blink" />
        <circle cx="37" cy="57" r="4" fill="#C4B5FD" stroke="none" />
        <circle cx="83" cy="57" r="4" fill="#C4B5FD" stroke="none" />
        <path d={mouth} fill="none" />
        <rect x="36" y="86" width="48" height="34" rx="12" fill="#C4B5FD" />
        <rect x="84" y="96" width="24" height="24" rx="4" fill="#FFD94A" />
        <path d="M91 96 q5 -12 10 0" fill="none" />
      </g>
    </svg>
  );
}

function LockGuard({ mood = "idle" }: { mood?: LockMood }) {
  const mouth = mood === "stop" ? "M50 93 H70" : mood === "ok" ? "M46 88 Q60 104 74 88" : "M52 90 Q60 97 68 90";
  return (
    <svg viewBox="0 0 120 130" className="h-full w-full" aria-hidden="true">
      <path d="M40 58 V40 a20 20 0 0 1 40 0 V58" fill="none" stroke="#000" strokeWidth="14" strokeLinecap="round" />
      <path d="M40 58 V40 a20 20 0 0 1 40 0 V58" fill="none" stroke="#E9E0FF" strokeWidth="8" strokeLinecap="round" />
      <g stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="24" y="56" width="72" height="58" rx="16" fill="#FFD94A" />
        <circle cx="46" cy="78" r="5.5" fill="#000" stroke="none" className="ch-blink" />
        <circle cx="74" cy="78" r="5.5" fill="#000" stroke="none" className="ch-blink" />
        {mood === "stop" && (
          <>
            <line x1="38" y1="66" x2="54" y2="72" />
            <line x1="82" y1="66" x2="66" y2="72" />
          </>
        )}
        <path d={mouth} fill="none" />
        <ellipse cx="44" cy="119" rx="12" ry="5" fill="#000" stroke="none" />
        <ellipse cx="76" cy="119" rx="12" ry="5" fill="#000" stroke="none" />
      </g>
      {mood === "stop" && (
        <g className="ch-pop">
          <circle cx="100" cy="46" r="16" fill="#fff" stroke="#000" strokeWidth="3" />
          <text x="100" y="51" textAnchor="middle" fontSize="13" fontWeight="800" fill="#000">
            NO
          </text>
        </g>
      )}
      {mood === "ok" && (
        <g className="ch-pop">
          <circle cx="98" cy="50" r="14" fill="#C4B5FD" stroke="#000" strokeWidth="3" />
          <path d="M91 50 l5 6 l10 -12" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

function Coin({ awake }: { awake: boolean }) {
  return (
    <svg viewBox="0 0 120 130" className="h-full w-full" aria-hidden="true">
      <g className={awake ? "ch-hop" : ""}>
        <g stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="60" cy="72" r="42" fill="#C4B5FD" />
          <circle cx="60" cy="72" r="33" fill="none" strokeDasharray="3 7" />
          <text x="60" y="52" textAnchor="middle" fontSize="15" fontWeight="800" fill="#000" stroke="none">
            $
          </text>
          {awake ? (
            <>
              <circle cx="46" cy="70" r="5" fill="#000" stroke="none" className="ch-blink" />
              <circle cx="74" cy="70" r="5" fill="#000" stroke="none" className="ch-blink" />
              <path d="M48 86 Q60 98 72 86" fill="none" />
            </>
          ) : (
            <>
              <path d="M40 70 q6 6 12 0" fill="none" />
              <path d="M68 70 q6 6 12 0" fill="none" />
              <path d="M54 90 H66" fill="none" />
            </>
          )}
        </g>
      </g>
      {!awake && (
        <g className="ch-float" fill="#000" fontWeight="800">
          <text x="100" y="32" fontSize="16">z</text>
          <text x="108" y="16" fontSize="12">z</text>
        </g>
      )}
    </svg>
  );
}

function Sneak() {
  return (
    <svg viewBox="0 0 120 110" className="h-full w-full" aria-hidden="true">
      <g stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 46 L34 14 L54 38 Z" fill="#000" />
        <path d="M92 46 L86 14 L66 38 Z" fill="#000" />
        <ellipse cx="60" cy="66" rx="40" ry="36" fill="#000" />
        <rect x="30" y="52" width="60" height="20" rx="10" fill="#C4B5FD" />
        <circle cx="46" cy="62" r="6" fill="#fff" />
        <circle cx="74" cy="62" r="6" fill="#fff" />
        <circle cx="47" cy="63" r="2.5" fill="#000" stroke="none" />
        <circle cx="75" cy="63" r="2.5" fill="#000" stroke="none" />
        <path d="M44 86 Q60 100 76 86" fill="none" stroke="#fff" />
        <g className="ch-wiggle">
          <rect x="72" y="84" width="40" height="24" rx="5" fill="#FFD94A" />
          <text x="92" y="100" textAnchor="middle" fontSize="11" fontWeight="800" fill="#000" stroke="none">
            $500
          </text>
        </g>
      </g>
    </svg>
  );
}

function Mascot({ verdict }: { verdict: string }) {
  if (verdict === "paid") return <Coin awake />;
  return <LockGuard mood={verdict === "block" ? "stop" : verdict === "allow" ? "ok" : "idle"} />;
}

function Jar({ pct }: { pct: number }) {
  const h = (Math.max(0, Math.min(100, pct)) / 100) * 92;
  return (
    <svg viewBox="0 0 120 140" className="h-full w-full" aria-hidden="true">
      <defs>
        <clipPath id="jar-inside">
          <rect x="24" y="36" width="72" height="92" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#jar-inside)">
        <rect x="24" y="36" width="72" height="92" fill="#fff" />
        <rect x="24" y={128 - h} width="72" height={h} fill="#C4B5FD" style={{ transition: "all 0.8s ease" }} />
      </g>
      <g stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="24" y="36" width="72" height="92" rx="14" fill="none" />
        <rect x="30" y="16" width="60" height="20" rx="7" fill="#FFD94A" />
        <circle cx="48" cy="72" r="4.5" fill="#000" stroke="none" className="ch-blink" />
        <circle cx="72" cy="72" r="4.5" fill="#000" stroke="none" className="ch-blink" />
        <path d="M50 88 Q60 98 70 88" fill="none" />
        {pct > 0 && (
          <>
            <circle cx="42" cy="118" r="7" fill="#FFD94A" strokeWidth="2.5" />
            <circle cx="60" cy="121" r="7" fill="#FFD94A" strokeWidth="2.5" />
          </>
        )}
      </g>
    </svg>
  );
}

/* ---------- UI pieces ---------- */

function Flow({ last }: { last?: Outcome }) {
  const v = last?.verdict;
  const reached = !last ? 0 : v === "block" || v === "needs_approval" ? 2 : 3;
  const robotMood: RobotMood = !last ? "idle" : v === "block" ? "sad" : v === "needs_approval" ? "idle" : "happy";
  const lockMood: LockMood = !last ? "idle" : v === "block" ? "stop" : v === "needs_approval" ? "idle" : "ok";
  const notes = [
    last ? "asked to buy" : "asks to buy",
    !last ? "checks every request" : v === "block" ? "said no" : v === "needs_approval" ? "waiting for you" : "said yes",
    !last ? "waits until allowed" : reached === 3 ? "order created" : "never contacted",
  ];
  const line = (on: boolean) => `mt-10 h-[3px] flex-1 sm:mt-12 ${on ? "ch-dash" : "bg-black/15"}`;
  const col = "flex w-24 flex-col items-center text-center sm:w-32";
  const art = "h-20 w-20 sm:h-24 sm:w-24";

  return (
    <div className="flex items-start rounded-3xl border-2 border-black bg-white p-5 shadow-[6px_6px_0_0_#000] sm:p-7">
      <div className={col}>
        <div className={`${art} ch-float`}><Robot mood={robotMood} /></div>
        <p className="mt-2 text-sm font-bold">AI assistant</p>
        <p className="text-xs text-black/70">{notes[0]}</p>
      </div>
      <div className={line(reached >= 2)} />
      <div className={col}>
        <div className={`${art} ch-float`} style={{ animationDelay: "0.6s" }}><LockGuard mood={lockMood} /></div>
        <p className="mt-2 text-sm font-bold">Interlock</p>
        <p className="text-xs text-black/70">{notes[1]}</p>
      </div>
      <div className={line(reached >= 3)} />
      <div className={`${col} transition-opacity duration-700 ${last && reached < 3 ? "opacity-40" : ""}`}>
        <div className={art}><Coin awake={reached === 3} /></div>
        <p className="mt-2 text-sm font-bold">PayPal</p>
        <p className="text-xs text-black/70">{notes[2]}</p>
      </div>
    </div>
  );
}

function StepHeader(props: { step: number; title: string; blurb: string }) {
  return (
    <div className="max-w-xl">
      <span className="inline-block -rotate-3 rounded-full border-2 border-black bg-white px-4 py-1 text-sm font-bold shadow-[3px_3px_0_0_#000]">
        Step {props.step}
      </span>
      <h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">{props.title}</h2>
      <p className="mt-3 text-lg text-black/75">{props.blurb}</p>
    </div>
  );
}

function RuleTile(props: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  tone: string;
  tilt: string;
  onChange: (v: number) => void;
}) {
  const dec = () => props.onChange(Math.max(props.min, props.value - props.step));
  const inc = () => props.onChange(Math.min(props.max, props.value + props.step));
  const round =
    "flex h-12 w-12 items-center justify-center rounded-full border-2 border-black bg-white text-2xl font-bold leading-none shadow-[3px_3px_0_0_#000] transition hover:-translate-y-0.5 active:translate-y-0.5";
  return (
    <div
      className={`rounded-3xl border-2 border-black p-5 shadow-[6px_6px_0_0_#000] transition-transform duration-300 hover:rotate-0 ${props.tone} ${props.tilt}`}
    >
      <p className="text-base font-bold leading-snug">{props.label}</p>
      <p className="mt-1 text-xs text-black/70">{props.hint}</p>
      <p className="my-5 text-center text-6xl font-extrabold tracking-tight">${props.value}</p>
      <div className="flex items-center justify-center gap-4">
        <button aria-label={`Decrease ${props.label}`} onClick={dec} className={round}>
          −
        </button>
        <button aria-label={`Increase ${props.label}`} onClick={inc} className={round}>
          +
        </button>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Home() {
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [draft, setDraft] = useState({ perOrder: 50, weekly: 120, approval: 20, cats: [] as string[] });
  const [ready, setReady] = useState(false);
  const [spent, setSpent] = useState(0);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [message, setMessage] = useState("");
  const [naive, setNaive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState<Chat[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [paidId, setPaidId] = useState<string | null>(null);
  const idRef = useRef(1);
  const chatRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [m, a] = await Promise.all([
      fetch("/api/mandate").then((r) => r.json()),
      fetch("/api/audit").then((r) => r.json()),
    ]);
    setMandate(m.mandate as Mandate);
    setSpent(a.spentCents as number);
    setAudit(a.audit as AuditEntry[]);
    return m.mandate as Mandate;
  }, []);

  useEffect(() => {
    refresh().then((m) => {
      setDraft(toDraft(m));
      setReady(true);
    });
    const p = new URLSearchParams(window.location.search).get("paid");
    if (p) setPaidId(p);
  }, [refresh]);

  const saveMandate = useCallback(async () => {
    const res = await fetch("/api/mandate", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        perOrderCapCents: Math.round(draft.perOrder * 100),
        weeklyCapCents: Math.round(draft.weekly * 100),
        approvalAboveCents: Math.round(draft.approval * 100),
        allowedCategories: draft.cats,
      }),
    });
    if (res.ok) await refresh();
  }, [draft, refresh]);

  // Rules save themselves shortly after you stop changing them.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(saveMandate, 350);
    return () => clearTimeout(t);
  }, [ready, saveMandate]);

  // Keep the chat scrolled to the newest message.
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, loading]);

  async function sendProposal(source: string, itemId: string, quantity: number, amountCents: number, userApproved = false) {
    const res = await fetch("/api/purchase", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ itemId, quantity, amountCents, currency: "USD", userApproved }),
    });
    const data = await res.json();
    const failed = ((data.decision?.checks ?? []) as Check[])
      .filter((c) => !c.passed)
      .map((c) => `${c.rule}: ${c.detail}`);
    const o: Outcome = {
      id: idRef.current++,
      source,
      itemId,
      quantity,
      amountCents,
      verdict: data.decision?.verdict ?? "error",
      paypalCalled: Boolean(data.paypalCalled),
      failed: data.error ? [String(data.error)] : failed,
      approveUrl: data.approveUrl,
    };
    setOutcomes((prev) => [o, ...prev]);
    await refresh();
  }

  async function ask(msg: string, naiveMode: boolean) {
    const text = msg.trim();
    if (!text || loading) return;
    setChat((c) => [...c, { role: "you", text }]);
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ message: text, naive: naiveMode }),
      });
      const data = await res.json();
      setChat((c) => [...c, { role: "assistant", text: data.reply || data.error || "I did not get a reply, please try again." }]);
      const list: Outcome[] = ((data.attempts ?? []) as AgentAttempt[]).map((a) => ({
        id: idRef.current++,
        source: "AI assistant",
        itemId: a.itemId,
        quantity: a.quantity,
        amountCents: a.claimedAmountCents,
        verdict: a.verdict,
        paypalCalled: a.paypalCalled,
        failed: a.failedChecks,
        approveUrl: a.approveUrl,
      }));
      setOutcomes((prev) => [...list.reverse(), ...prev]);
      await refresh();
    } catch {
      setChat((c) => [...c, { role: "assistant", text: "I could not reach the server. Is it running?" }]);
    } finally {
      setLoading(false);
    }
  }

  async function resetDemo() {
    await fetch("/api/reset", { method: "POST" });
    setOutcomes([]);
    setChat([]);
    setPaidId(null);
    window.history.replaceState(null, "", "/");
    const m = await refresh();
    setDraft(toDraft(m));
  }

  const pct = mandate ? Math.min(100, (spent / Math.max(1, mandate.weeklyCapCents)) * 100) : 0;
  const press = "transition hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0";
  const yellowBtn = `rounded-full border-2 border-black bg-[#FFD94A] px-5 py-2.5 text-sm font-bold text-black shadow-[3px_3px_0_0_#000] ${press}`;
  const blackBtn = `rounded-full border-2 border-black bg-black px-5 py-2.5 text-sm font-bold text-white ${press}`;
  const chip = `rounded-full border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black ${press} hover:bg-violet-200`;

  return (
    <main
      className="relative min-h-screen overflow-x-hidden bg-[#F3EEFF] text-black"
      style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.09) 1.5px, transparent 1.5px)", backgroundSize: "24px 24px" }}
    >
      <style>{`
        @keyframes ch-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes ch-bob { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-8px) rotate(3deg)} }
        @keyframes ch-blink { 0%,92%,100%{transform:scaleY(1)} 96%{transform:scaleY(0.1)} }
        @keyframes ch-pop { 0%{transform:scale(0)} 70%{transform:scale(1.2)} 100%{transform:scale(1)} }
        @keyframes ch-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
        @keyframes ch-rise { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        @keyframes ch-hop { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes ch-wiggle { 0%,100%{transform:rotate(-6deg)} 50%{transform:rotate(6deg)} }
        @keyframes ch-ping { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }
        @keyframes ch-dash { to{background-position:16px 0} }
        @keyframes ch-marquee { to{transform:translateX(-50%)} }
        @keyframes ch-stamp { 0%{transform:scale(2.6) rotate(-22deg);opacity:0} 55%{transform:scale(0.92) rotate(-9deg);opacity:1} 100%{transform:scale(1) rotate(-9deg);opacity:1} }
        .ch-float{animation:ch-float 5s ease-in-out infinite}
        .ch-bob{animation:ch-bob 4s ease-in-out infinite}
        .ch-blink{transform-box:fill-box;transform-origin:center;animation:ch-blink 4.5s infinite}
        .ch-pop{transform-box:fill-box;transform-origin:center;animation:ch-pop .45s ease-out both}
        .ch-rise{animation:ch-rise .45s ease-out both}
        .ch-hop{animation:ch-hop 1.1s ease-in-out infinite}
        .ch-wiggle{transform-box:fill-box;transform-origin:center;animation:ch-wiggle 1.6s ease-in-out infinite}
        .ch-ping{transform-box:fill-box;transform-origin:center;animation:ch-ping 1.8s ease-in-out infinite}
        .ch-dash{background-image:repeating-linear-gradient(90deg,#000 0 8px,transparent 8px 16px);background-size:16px 3px;animation:ch-dash .6s linear infinite}
        .ch-marquee{animation:ch-marquee 32s linear infinite}
        .ch-stamp{animation:ch-stamp .5s cubic-bezier(.2,.8,.3,1.2) .15s both}
        @media (prefers-reduced-motion: reduce){
          .ch-float,.ch-bob,.ch-blink,.ch-pop,.ch-rise,.ch-hop,.ch-wiggle,.ch-ping,.ch-dash,.ch-marquee,.ch-stamp{animation:none!important}
        }
      `}</style>

      {/* soft floating blobs */}
      <div className="ch-float pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-violet-300/50 blur-3xl" />
      <div className="ch-float pointer-events-none absolute -right-16 top-10 h-80 w-80 rounded-full bg-[#FFD94A]/40 blur-3xl" style={{ animationDelay: "1.5s" }} />

      <div className="relative z-10">
        {/* NAV */}
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10"><LockGuard mood="ok" /></div>
            <span className="text-xl font-extrabold tracking-tight">Interlock</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden rounded-full border-2 border-black bg-[#FFD94A] px-3 py-1 text-xs font-bold sm:inline">
              PayPal sandbox · test money only
            </span>
            <button onClick={resetDemo} className="text-sm font-medium underline decoration-2 underline-offset-4 hover:decoration-violet-400">
              Start over
            </button>
          </div>
        </nav>

        {/* HERO */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-14 pt-12 md:grid-cols-[1.2fr_0.8fr] md:pt-16">
          <div>
            <h1 className="mt-0 text-5xl font-extrabold leading-[1.02] tracking-tight md:text-7xl">
              Let AI do the shopping.
              <br />
              You keep the{" "}
              <span className="relative inline-block">
                <span className="absolute inset-x-0 bottom-1 h-4 -rotate-1 bg-[#FFD94A] md:h-6" />
                <span className="relative">keys.</span>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-black/75">
              An AI assistant can ask for anything. Interlock is the friendly bouncer in between, and your rules decide what actually gets paid.
            </p>
            <a href="#rules" className={`${yellowBtn} mt-8 inline-block`}>
              Try it out ↓
            </a>
          </div>

          <div className="relative mx-auto flex h-72 w-72 items-center justify-center rounded-full border-2 border-black bg-violet-300 shadow-[8px_8px_0_0_#000] sm:h-80 sm:w-80">
            <div className="ch-float h-52 w-52 sm:h-60 sm:w-60"><LockGuard mood="idle" /></div>
            <span className="ch-bob absolute -left-4 top-8 rounded-full border-2 border-black bg-white px-3 py-1 text-sm font-bold">✓ Approved</span>
            <span className="ch-bob absolute -right-3 bottom-12 rounded-full bg-black px-3 py-1 text-sm font-bold text-white" style={{ animationDelay: "1s" }}>
              ✕ Blocked
            </span>
            <span className="ch-hop absolute right-8 top-2 text-3xl text-[#FFD94A] [text-shadow:2px_2px_0_#000]">✦</span>
            <span className="ch-hop absolute bottom-4 left-10 text-2xl text-white [text-shadow:2px_2px_0_#000]" style={{ animationDelay: "0.5s" }}>✦</span>
          </div>
        </section>

        {/* TICKER */}
        <div className="overflow-hidden border-y-2 border-black bg-[#FFD94A] py-2.5">
          <div className="ch-marquee flex w-max whitespace-nowrap text-sm font-bold">
            {[0, 1].map((k) => (
              <div key={k} className="flex gap-10 pr-10">
                {TICKER.map((t) => (
                  <span key={`${k}-${t}`}>✦ {t}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* PIPELINE */}
        <section className="mx-auto max-w-6xl px-6 py-12">
          <Flow last={outcomes[0]} />
        </section>

        {paidId && (
          <div className="mx-auto mb-10 max-w-6xl px-6">
            <div className="rounded-2xl border-2 border-black bg-[#FFD94A] px-5 py-4 text-sm font-medium shadow-[4px_4px_0_0_#000]">
              That payment went through (PayPal order {paidId}). You can see it in the activity tape at the bottom.
            </div>
          </div>
        )}

        {/* STEP 1: RULES */}
        <section
          id="rules"
          className="border-y-2 border-black bg-violet-300"
          style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.14) 1.5px, transparent 1.5px)", backgroundSize: "22px 22px" }}
        >
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="flex flex-wrap items-end justify-between gap-8">
              <StepHeader
                step={1}
                title="Set the rules."
                blurb="Choose how much your assistant may spend. It can never change these, no matter what it is told."
              />
              <div className="flex items-center gap-4 rounded-3xl border-2 border-black bg-white p-4 pr-6 shadow-[6px_6px_0_0_#000]">
                <div className="ch-float h-28 w-24 shrink-0"><Jar pct={pct} /></div>
                <div>
                  <p className="text-sm font-medium text-black/70">Spent this week</p>
                  <p className="text-4xl font-extrabold tracking-tight">{usd(spent)}</p>
                  <p className="text-sm text-black/70">of {mandate ? usd(mandate.weeklyCapCents) : "..."} allowed</p>
                </div>
              </div>
            </div>

            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <RuleTile
                label="Most on one order"
                hint="Anything bigger gets blocked."
                value={draft.perOrder}
                min={0}
                max={200}
                step={5}
                tone="bg-white"
                tilt="-rotate-2"
                onChange={(v) => setDraft({ ...draft, perOrder: v })}
              />
              <RuleTile
                label="Most in a week"
                hint="The jar fills up as you spend."
                value={draft.weekly}
                min={0}
                max={500}
                step={10}
                tone="bg-[#FFD94A]"
                tilt="rotate-1"
                onChange={(v) => setDraft({ ...draft, weekly: v })}
              />
              <RuleTile
                label="Ask me first above"
                hint="Bigger orders wait for your OK."
                value={draft.approval}
                min={0}
                max={100}
                step={5}
                tone="bg-white"
                tilt="-rotate-1"
                onChange={(v) => setDraft({ ...draft, approval: v })}
              />
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <span className="text-base font-bold">It may buy:</span>
              {CATEGORIES.map((c) => {
                const on = draft.cats.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => setDraft({ ...draft, cats: on ? draft.cats.filter((x) => x !== c) : [...draft.cats, c] })}
                    className={`rounded-full border-2 border-black px-5 py-2 text-sm font-bold shadow-[3px_3px_0_0_#000] ${press} ${
                      on ? "bg-black text-white" : "bg-white text-black/60"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {c.replace("_", " ")}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* STEP 2: PLAY */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <StepHeader
            step={2}
            title="Now put it to the test."
            blurb="Chat with the shopping assistant on the left. Or play the attacker on the right and try to sneak something past Interlock."
          />

          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[360px_1fr]">
            {/* phone */}
            <div>
              <div className="mx-auto w-full max-w-[360px] rounded-[2.75rem] border-2 border-black bg-black p-3 shadow-[8px_8px_0_0_#000]">
                <div className="overflow-hidden rounded-[2.1rem] bg-white">
                  <div className="relative flex items-center gap-3 border-b-2 border-black bg-violet-300 px-5 pb-3 pt-7">
                    <div className="absolute left-1/2 top-2.5 h-1.5 w-16 -translate-x-1/2 rounded-full bg-black" />
                    <div className="h-11 w-11 shrink-0 rounded-full border-2 border-black bg-white p-1"><Robot mood="happy" /></div>
                    <div>
                      <p className="text-base font-extrabold leading-tight">Shopping assistant</p>
                      <p className="text-xs text-black/70">Asks Interlock before it pays</p>
                    </div>
                  </div>

                  <div ref={chatRef} className="h-[400px] space-y-3 overflow-y-auto bg-[#F3EEFF] p-4">
                    {chat.length === 0 && !loading && (
                      <div className="flex items-end gap-2">
                        <div className="h-8 w-8 shrink-0"><Robot mood="idle" /></div>
                        <p className="max-w-[80%] rounded-2xl rounded-bl-md border-2 border-black bg-white px-4 py-3 text-[15px] leading-relaxed">
                          Hi! What should I get for you today? Tap a suggestion below, or type your own.
                        </p>
                      </div>
                    )}
                    {chat.map((c, i) => (
                      <div key={i} className={`flex items-end gap-2 ${c.role === "you" ? "justify-end" : "justify-start"}`}>
                        {c.role === "assistant" && <div className="h-8 w-8 shrink-0"><Robot mood="idle" /></div>}
                        <p
                          className={`ch-rise max-w-[80%] whitespace-pre-wrap rounded-2xl border-2 border-black px-4 py-3 text-[15px] leading-relaxed ${
                            c.role === "you" ? "rounded-br-md bg-[#FFD94A]" : "rounded-bl-md bg-white"
                          }`}
                        >
                          {c.text}
                        </p>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex items-end gap-2">
                        <div className="ch-hop h-8 w-8 shrink-0"><Robot mood="idle" /></div>
                        <p className="rounded-2xl rounded-bl-md border-2 border-black bg-white px-4 py-3 text-sm">Working on it...</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t-2 border-black/10 bg-white px-3 pt-3">
                    {PRESETS.map((p) => (
                      <button
                        key={p.label}
                        disabled={loading}
                        className={chip}
                        onClick={() => {
                          setNaive(p.naive);
                          ask(p.msg, p.naive);
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 bg-white p-3">
                    <input
                      className="min-w-0 flex-1 rounded-full border-2 border-black bg-[#F3EEFF] px-4 py-2 text-sm text-black outline-none placeholder:text-black/45"
                      placeholder="Type a message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") ask(message, naive);
                      }}
                    />
                    <button
                      disabled={loading || !message.trim()}
                      onClick={() => ask(message, naive)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#FFD94A] text-lg font-bold transition hover:-translate-y-0.5 disabled:opacity-50"
                      aria-label="Send"
                    >
                      ↑
                    </button>
                  </div>
                </div>
              </div>

              <label className="mx-auto mt-6 flex max-w-[360px] cursor-pointer items-center gap-3 text-sm font-medium text-black/80">
                <input type="checkbox" className="peer sr-only" checked={naive} onChange={(e) => setNaive(e.target.checked)} />
                <span className="relative h-7 w-12 shrink-0 rounded-full border-2 border-black bg-white transition peer-checked:bg-[#FFD94A] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-black after:transition-all after:content-[''] peer-checked:after:translate-x-5" />
                Make the assistant easy to fool, to test the defenses
              </label>
            </div>

            {/* attacker stage */}
            <div className="relative overflow-hidden rounded-[2.5rem] border-2 border-black bg-[#FFD94A] p-8 shadow-[8px_8px_0_0_#000] sm:p-10">
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.16) 1.5px, transparent 1.5px)", backgroundSize: "20px 20px" }}
              />
              <div className="relative">
                <div className="flex items-start gap-5">
                  <div className="ch-bob h-40 w-44 shrink-0"><Sneak /></div>
                  <div className="relative mt-3 rounded-2xl border-2 border-black bg-white p-4 text-base font-medium leading-snug">
                    <span className="absolute -left-2 top-6 h-4 w-4 rotate-45 border-b-2 border-l-2 border-black bg-white" />
                    Psst... want a $500 gift card? The AI will never notice.
                  </div>
                </div>
                <h3 className="mt-8 text-3xl font-extrabold tracking-tight">Play the attacker.</h3>
                <p className="mt-2 max-w-md text-base text-black/80">
                  This gremlin pretends to be a hijacked assistant and fires off bad requests. Interlock treats them like any other.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button className={blackBtn} onClick={() => sendProposal("Hijacked assistant", "gift-card-500", 1, 50000)}>
                    Try buying a $500 gift card
                  </button>
                  <button
                    className={`rounded-full border-2 border-black bg-white px-5 py-2.5 text-sm font-bold ${press}`}
                    onClick={() => sendProposal("Hijacked assistant", "usb-c-cable", 1, 100)}
                  >
                    Try changing the price
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STEP 3: RECEIPTS */}
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <StepHeader
            step={3}
            title="Here is what Interlock decided."
            blurb="Every request gets a receipt and a stamp. Watch the pipeline up top light up as they land."
          />

          {outcomes.length === 0 && (
            <div className="mt-10 flex items-center gap-5 rounded-3xl border-2 border-dashed border-black/40 bg-white/70 p-6">
              <div className="ch-float h-20 w-20 shrink-0"><LockGuard mood="idle" /></div>
              <p className="text-base text-black/75">No receipts yet. Send a message to the assistant, or play the attacker above.</p>
            </div>
          )}

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            {outcomes.map((o) => {
              const s = styleFor(o.verdict);
              return (
                <div key={o.id} className="ch-rise relative pt-3">
                  <div
                    className="relative rounded-2xl border-2 border-black bg-white p-6 shadow-[6px_6px_0_0_#000]"
                    style={o.verdict === "block" ? { animation: "ch-shake .5s ease-in-out .5s both" } : undefined}
                  >
                    <span className="absolute -left-[13px] top-[104px] h-5 w-5 rounded-full border-2 border-black bg-[#F3EEFF]" />
                    <span className="absolute -right-[13px] top-[104px] h-5 w-5 rounded-full border-2 border-black bg-[#F3EEFF]" />

                    <p className="pr-28 font-mono text-xs text-black/60">Interlock receipt · from {o.source}</p>
                    <div className="mt-4 flex items-baseline gap-2 font-mono text-[15px]">
                      <span className="font-bold">
                        {o.quantity} × {itemName(o.itemId)}
                      </span>
                      <span className="flex-1 border-b-2 border-dotted border-black/40" />
                      <span className="font-bold">{usd(o.amountCents)}</span>
                    </div>
                    <div className="my-5 border-t-2 border-dashed border-black/30" />

                    {o.failed.length === 0 ? (
                      <p className="font-mono text-sm">✓ Every rule checked out.</p>
                    ) : (
                      <ul className="space-y-2.5 sm:pr-16">
                        {o.failed.map((f, i) => {
                          const r = explain(f);
                          return (
                            <li key={i} className="text-sm leading-relaxed">
                              <span className="font-bold">✕ {r.title || "Blocked"}</span>
                              <br />
                              <span className="text-black/70">{r.detail}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <p className="mt-4 font-mono text-xs text-black/60">
                      {o.paypalCalled ? "PayPal: order created." : "PayPal: never contacted."}
                    </p>

                    {(o.verdict === "needs_approval" || o.approveUrl) && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {o.verdict === "needs_approval" && (
                          <button className={blackBtn} onClick={() => sendProposal("You approved", o.itemId, o.quantity, o.amountCents, true)}>
                            Yes, approve this
                          </button>
                        )}
                        {o.approveUrl && (
                          <a className={blackBtn} href={o.approveUrl} target="_blank" rel="noreferrer">
                            Pay with PayPal sandbox &rarr;
                          </a>
                        )}
                      </div>
                    )}

                    <div className="pointer-events-none absolute bottom-3 right-3 hidden h-16 w-16 sm:block">
                      <Mascot verdict={o.verdict} />
                    </div>
                  </div>

                  <span
                    className={`ch-stamp absolute -right-3 top-0 rounded-lg border-[3px] border-black px-4 py-1.5 text-xl font-extrabold tracking-wide ${s.stamp}`}
                  >
                    {s.word}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ACTIVITY TAPE */}
        <section className="border-y-2 border-black bg-[#FFD94A]">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-[1fr_1.1fr]">
            <div>
              <div className="ch-float h-32 w-32"><LockGuard mood="ok" /></div>
              <h2 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">The flight recorder.</h2>
              <p className="mt-3 max-w-md text-lg text-black/80">
                Interlock writes down every request and what it did about it, so you can always check what happened.
              </p>
            </div>

            <div className="max-h-[520px] overflow-y-auto rounded-2xl border-2 border-black bg-white p-6 font-mono text-[13px] shadow-[8px_8px_0_0_#000]">
              <p className="border-b-2 border-dashed border-black/30 pb-3 text-center font-bold">Interlock activity tape</p>
              {audit.length === 0 && <p className="pt-4 text-black/60">Nothing printed yet.</p>}
              <ul className="divide-y-2 divide-dashed divide-black/20">
                {[...audit].reverse().map((e, i) => (
                  <li key={i} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold">{styleFor(e.verdict).label}</span>
                      <span className="text-black/50">{new Date(e.at).toLocaleTimeString()}</span>
                    </div>
                    <p className="mt-1">
                      {e.proposal.quantity} × {itemName(e.proposal.itemId)} · {usd(e.proposal.amountCents)}
                    </p>
                    <p className="text-black/65">{e.note}</p>
                    {e.checks
                      .filter((c) => !c.passed)
                      .map((c, j) => (
                        <p key={j} className="text-black/65">
                          ✕ {RULE_LABELS[c.rule] ?? c.rule}
                        </p>
                      ))}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="bg-white py-6 text-center text-sm font-medium">
          Sandbox only. No real money moves anywhere in this demo.
        </footer>
      </div>
    </main>
  );
}
