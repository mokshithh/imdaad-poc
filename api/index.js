require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

// ─── Config ────────────────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const PRICE_PER_KG  = parseFloat(process.env.PRICE_PER_KG || "2.50");
const MIN_WEIGHT_KG = 0.01;
const ALLOW_NEGATIVE = false;

// ─── Validate env ──────────────────────────────────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("WARNING: SUPABASE_URL and SUPABASE_SERVICE_KEY are not set. API calls will fail.");
}

// ─── Supabase ──────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── App ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ─── Helpers ───────────────────────────────────────────────────────────────
function invoiceId() {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,"");
  const r = Math.random().toString(36).toUpperCase().slice(2,6);
  return `INV-${d}-${r}`;
}

function receipt(tx, customer, wallet) {
  return {
    invoiceId:     tx.invoice_id,
    transactionId: tx.id,
    issuedAt:      tx.timestamp,
    status:        tx.status,
    customer:      { id: customer.id, name: customer.name, phone: customer.phone, qrId: customer.qr_id },
    collection:    { weightKg: tx.weight_kg, ratePerKg: tx.price_per_kg },
    billing:       { totalCharged: tx.amount, walletBefore: wallet.before, walletAfter: wallet.after, deducted: wallet.deducted },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/customers
app.post("/api/customers", async (req, res) => {
  const { name, phone, initialBalance = 0 } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "name and phone required" });

  const row = {
    id:             uuidv4(),
    qr_id:          `WC-${Date.now()}`,
    name:           String(name).trim(),
    phone:          String(phone).trim(),
    wallet_balance: Math.max(0, parseFloat(initialBalance) || 0),
    created_at:     new Date().toISOString(),
  };

  const { data, error } = await supabase.from("customers").insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true, customer: data });
});

// GET /api/customers
app.get("/api/customers", async (req, res) => {
  const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/customers/qr/:qrId
app.get("/api/customers/qr/:qrId", async (req, res) => {
  const { data, error } = await supabase.from("customers").select("*").eq("qr_id", req.params.qrId).single();
  if (error || !data) return res.status(404).json({ error: "Customer not found" });
  res.json(data);
});

// GET /api/customers/:id
app.get("/api/customers/:id", async (req, res) => {
  const { data, error } = await supabase.from("customers").select("*").eq("id", req.params.id).single();
  if (error || !data) return res.status(404).json({ error: "Customer not found" });
  res.json(data);
});

// POST /api/customers/:id/topup
app.post("/api/customers/:id/topup", async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: "amount must be > 0" });

  const { data: c, error: fe } = await supabase.from("customers").select("wallet_balance").eq("id", req.params.id).single();
  if (fe || !c) return res.status(404).json({ error: "Customer not found" });

  const newBal = parseFloat((c.wallet_balance + amount).toFixed(2));
  const { data, error } = await supabase.from("customers").update({ wallet_balance: newBal }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, newBalance: newBal, customer: data });
});

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTIONS / BILLING
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/collections  — core billing endpoint
app.post("/api/collections", async (req, res) => {
  const { customerId, weight, collectorId = "app", notes = "" } = req.body;
  if (!customerId || weight === undefined) return res.status(400).json({ error: "customerId and weight required" });

  const weightKg = parseFloat(weight);
  if (isNaN(weightKg) || weightKg < MIN_WEIGHT_KG) return res.status(400).json({ error: `Min weight: ${MIN_WEIGHT_KG} kg` });

  const { data: customer, error: fe } = await supabase.from("customers").select("*").eq("id", customerId).single();
  if (fe || !customer) return res.status(404).json({ error: "Customer not found" });

  const amount    = parseFloat((weightKg * PRICE_PER_KG).toFixed(2));
  const balBefore = parseFloat(customer.wallet_balance);
  const balAfter  = parseFloat((balBefore - amount).toFixed(2));

  if (!ALLOW_NEGATIVE && balAfter < 0) {
    return res.status(402).json({
      error:    "Insufficient balance",
      walletBalance: balBefore,
      required:  amount,
      shortfall: parseFloat((amount - balBefore).toFixed(2)),
    });
  }

  // Deduct wallet
  const { error: we } = await supabase.from("customers").update({ wallet_balance: balAfter }).eq("id", customerId);
  if (we) return res.status(500).json({ error: we.message });

  // Store transaction
  const tx = {
    id:             uuidv4(),
    invoice_id:     invoiceId(),
    customer_id:    customer.id,
    customer_name:  customer.name,
    customer_phone: customer.phone,
    collector_id:   collectorId,
    weight_kg:      weightKg,
    price_per_kg:   PRICE_PER_KG,
    amount,
    balance_before: balBefore,
    balance_after:  balAfter,
    status:         balAfter < 0 ? "overdraft" : "paid",
    notes:          String(notes).trim(),
    timestamp:      new Date().toISOString(),
  };

  const { data: saved, error: te } = await supabase.from("transactions").insert(tx).select().single();
  if (te) return res.status(500).json({ error: te.message });

  const wallet = { before: balBefore, after: balAfter, deducted: amount };
  res.status(201).json({
    success:     true,
    transaction: saved,
    wallet:      { balanceBefore: balBefore, balanceAfter: balAfter, deducted: amount },
    receipt:     receipt(saved, customer, wallet),
  });
});

// GET /api/collections
app.get("/api/collections", async (req, res) => {
  let q = supabase.from("transactions").select("*").order("timestamp", { ascending: false });
  if (req.query.customerId) q = q.eq("customer_id", req.query.customerId);
  if (req.query.limit)      q = q.limit(parseInt(req.query.limit));

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: data.length, transactions: data });
});

// GET /api/collections/receipt/:invoiceId
app.get("/api/collections/receipt/:invoiceId", async (req, res) => {
  const { data: tx, error } = await supabase.from("transactions").select("*").eq("invoice_id", req.params.invoiceId).single();
  if (error || !tx) return res.status(404).json({ error: "Receipt not found" });

  const { data: customer } = await supabase.from("customers").select("*").eq("id", tx.customer_id).single();
  const wallet = { before: tx.balance_before, after: tx.balance_after, deducted: tx.amount };
  res.json(receipt(tx, customer || { id: tx.customer_id, name: tx.customer_name, phone: tx.customer_phone || "", qr_id: "" }, wallet));
});

// GET /api/collections/:id
app.get("/api/collections/:id", async (req, res) => {
  const { data, error } = await supabase.from("transactions").select("*").eq("id", req.params.id).single();
  if (error || !data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH / CATCH-ALL
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api", (req, res) => {
  res.json({
    service:    "Imdaad WastePro API",
    version:    "2.0.0",
    pricePerKg: PRICE_PER_KG,
    endpoints: [
      "POST   /api/customers",
      "GET    /api/customers",
      "GET    /api/customers/qr/:qrId",
      "GET    /api/customers/:id",
      "POST   /api/customers/:id/topup",
      "POST   /api/collections",
      "GET    /api/collections",
      "GET    /api/collections/receipt/:invoiceId",
      "GET    /api/collections/:id",
    ],
  });
});

// Serve frontend for all non-API routes (local dev)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`\n✅ Imdaad WastePro running → http://localhost:${PORT}`);
  console.log(`   Admin dashboard  → http://localhost:${PORT}`);
  console.log(`   API health       → http://localhost:${PORT}/api\n`);
});

module.exports = app;
