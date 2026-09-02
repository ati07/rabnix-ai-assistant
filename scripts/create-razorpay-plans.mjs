import { readFileSync } from "node:fs";

/**
 * Create the four Razorpay Subscription Plans the billing flow needs — Basic and
 * Pro, each monthly + yearly — using the API keys already in .env, so you don't
 * have to click through the dashboard. Prints only the resulting plan ids (never
 * secrets). Paste them into the matching RAZORPAY_PLAN_* vars.
 *
 *   node scripts/create-razorpay-plans.mjs
 *
 * Amounts mirror src/lib/billing/plans.ts (Basic ₹999/mo·₹9,990/yr,
 * Pro ₹1,499/mo·₹14,990/yr). Lifetime (₹20,000) is a one-time order, not a plan.
 */

function loadEnv(path = "./.env") {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

const env = loadEnv();
const keyId = env.RAZORPAY_KEY_ID;
const keySecret = env.RAZORPAY_KEY_SECRET;
if (!keyId || !keySecret) {
  console.error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing in .env");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

async function createPlan({ period, amount, name }) {
  const res = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      period,
      interval: 1,
      item: { name, amount, currency: "INR", description: name },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.description ?? `HTTP ${res.status}`);
  }
  return body.id;
}

try {
  const basicMonthly = await createPlan({
    period: "monthly",
    amount: 99900, // ₹999
    name: "Rabnix Basic (Monthly)",
  });
  const basicYearly = await createPlan({
    period: "yearly",
    amount: 999000, // ₹9,990
    name: "Rabnix Basic (Yearly)",
  });
  const proMonthly = await createPlan({
    period: "monthly",
    amount: 149900, // ₹1,499
    name: "Rabnix Pro (Monthly)",
  });
  const proYearly = await createPlan({
    period: "yearly",
    amount: 1499000, // ₹14,990
    name: "Rabnix Pro (Yearly)",
  });

  console.log("✓ Plans created. Set these in .env:\n");
  console.log(`RAZORPAY_PLAN_BASIC_MONTHLY=${basicMonthly}`);
  console.log(`RAZORPAY_PLAN_BASIC_YEARLY=${basicYearly}`);
  console.log(`RAZORPAY_PLAN_PRO_MONTHLY=${proMonthly}`);
  console.log(`RAZORPAY_PLAN_PRO_YEARLY=${proYearly}`);
} catch (err) {
  console.error("Failed to create plans:", err.message);
  process.exit(1);
}
