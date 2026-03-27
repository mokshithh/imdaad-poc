# WastePro — Digital Waste Collection & Billing

> Full-stack POC: QR scan → Bluetooth scale → auto-deduct wallet → digital receipt

## Project Structure

```
wastepro/
├── api/
│   └── index.js          ← Entire backend (Express + Supabase)
├── public/
│   └── index.html        ← Entire frontend (Admin Dashboard)
├── supabase-schema.sql   ← Run once in Supabase
├── package.json
├── vercel.json
└── .env.example
```

---

## Deploy in 3 Steps

### Step 1 — Supabase (2 min)

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Open **SQL Editor** → paste the contents of `supabase-schema.sql` → **Run**
3. Go to **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret → `SUPABASE_SERVICE_KEY`

### Step 2 — GitHub (1 min)

```bash
git init
git add .
git commit -m "init wastepro"
git remote add origin https://github.com/YOUR_USER/wastepro.git
git push -u origin main
```

### Step 3 — Vercel (2 min)

1. [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo
2. **Environment Variables** — add these three:

   | Key | Value |
   |-----|-------|
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | `your-service-role-secret` |
   | `PRICE_PER_KG` | `2.50` |

3. Click **Deploy** ✅

Your live URLs:
- Admin dashboard: `https://your-app.vercel.app`
- API health: `https://your-app.vercel.app/api`

---

## Local Development

```bash
cp .env.example .env       # fill in your Supabase keys
npm install
npm run dev                # → http://localhost:3000
```

---

## Mobile App (Expo)

Update `config/api.js` in the Expo app:
```js
// Local
export const API_BASE_URL = "http://192.168.1.X:3000";

// Production
export const API_BASE_URL = "https://your-app.vercel.app";
```

All API routes are now prefixed with `/api`:
- `GET  /api/customers/qr/:qrId`
- `POST /api/collections`

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api` | Health check + config |
| `POST` | `/api/customers` | Create customer + wallet |
| `GET`  | `/api/customers` | List all customers |
| `GET`  | `/api/customers/qr/:qrId` | QR scan lookup |
| `GET`  | `/api/customers/:id` | Get by ID |
| `POST` | `/api/customers/:id/topup` | Add wallet funds |
| `POST` | `/api/collections` | Record collection + bill |
| `GET`  | `/api/collections` | All transactions |
| `GET`  | `/api/collections/receipt/:invoiceId` | Digital receipt |
| `GET`  | `/api/collections/:id` | Single transaction |

### POST /api/collections — Response shape
```json
{
  "success": true,
  "transaction": { "id", "invoice_id", "weight_kg", "amount", ... },
  "wallet": { "balanceBefore", "balanceAfter", "deducted" },
  "receipt": { "invoiceId", "customer", "collection", "billing" }
}
```

## Config

| Variable | Default | Description |
|----------|---------|-------------|
| `PRICE_PER_KG` | `2.50` | Billing rate in USD |
| `SUPABASE_URL` | — | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | — | Supabase service role key |
| `PORT` | `3000` | Local dev port |
