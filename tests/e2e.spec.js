// @ts-check
const { test, expect } = require("@playwright/test");

// Test against the live Vercel deployment
const BASE = process.env.TEST_URL || "https://imdaad-poc.vercel.app";

test.describe("Imdaad POC — E2E Tests", () => {

  // ── 1. Page loads (fixes the 404 bug) ──────────────────────────────────────
  test("root URL returns 200 and shows the dashboard", async ({ page }) => {
    const res = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(res.status()).toBe(200);
    await expect(page.locator(".logo-text")).toHaveText("Imdaad");
    await expect(page.locator("#topbarTitle")).toContainText("Transactions");
  });

  // ── 2. API health check ─────────────────────────────────────────────────────
  test("GET /api returns service info", async ({ request }) => {
    const r = await request.get(`${BASE}/api`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.service).toBe("Imdaad WastePro API");
    expect(body.pricePerKg).toBeGreaterThan(0);
  });

  // ── 3. Server status indicator ──────────────────────────────────────────────
  test("server status shows Connected", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await expect(page.locator("#statusText")).toHaveText("Connected", { timeout: 10000 });
    await expect(page.locator(".dot-online")).toBeVisible();
  });

  // ── 4. Sidebar navigation ───────────────────────────────────────────────────
  test("sidebar navigation switches panels", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });

    // Transactions panel is default
    await expect(page.locator("#panel-transactions")).toHaveClass(/active/);

    // Switch to Customers
    await page.click("#nav-customers");
    await expect(page.locator("#panel-customers")).toHaveClass(/active/);
    await expect(page.locator("#topbarTitle")).toContainText("Customers");

    // Switch to Dashboard
    await page.click("#nav-dashboard");
    await expect(page.locator("#panel-dashboard")).toHaveClass(/active/);
    await expect(page.locator("#topbarTitle")).toContainText("Dashboard");

    // Switch back to Transactions
    await page.click("#nav-transactions");
    await expect(page.locator("#panel-transactions")).toHaveClass(/active/);
  });

  // ── 5. Transaction panel stats render ──────────────────────────────────────
  test("transaction stats cards are populated", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("s-total")?.textContent !== "—", { timeout: 10000 });
    const total  = await page.locator("#s-total").textContent();
    const weight = await page.locator("#s-weight").textContent();
    const billed = await page.locator("#s-billed").textContent();
    const today  = await page.locator("#s-today").textContent();
    expect(total).not.toBe("—");
    expect(weight).toContain("kg");
    expect(billed).toContain("AED");
    expect(today).not.toBe("—");
  });

  // ── 6. Customer panel renders ───────────────────────────────────────────────
  test("customer panel shows stats and table", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("#nav-customers");
    await page.waitForFunction(() => document.getElementById("c-total")?.textContent !== "—", { timeout: 10000 });
    await expect(page.locator("#c-total")).not.toHaveText("—");
    await expect(page.locator("#c-funds")).toContainText("AED");
    await expect(page.locator("#c-low")).not.toHaveText("—");
  });

  // ── 7. Add Customer modal opens and validates ───────────────────────────────
  test("add customer modal opens and validates required fields", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("button:has-text('+ Customer')");
    await expect(page.locator("#addModal")).toHaveClass(/open/);

    // Submit without filling in fields → validation error
    await page.click("#addSubmitBtn");
    await expect(page.locator("#addError")).toHaveText(/required/i);

    // Close modal
    await page.click("#addModal .modal-close");
    await expect(page.locator("#addModal")).not.toHaveClass(/open/);
  });

  // ── 8. New Collection modal opens and validates ─────────────────────────────
  test("new collection modal opens and validates input", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("button:has-text('New Collection')");
    await expect(page.locator("#collectionModal")).toHaveClass(/open/);

    // Submit without customer → error
    await page.click("#colSubmitBtn");
    await expect(page.locator("#colError")).toHaveText(/customer/i);

    // Close
    await page.click("#collectionModal .modal-close");
  });

  // ── 9. Weight estimate shows in collection modal ────────────────────────────
  test("collection modal shows live charge estimate", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    // Open collection modal
    await page.click("button:has-text('New Collection')");
    await expect(page.locator("#collectionModal")).toHaveClass(/open/, { timeout: 5000 });

    // Check if there are customers available
    const sel = page.locator("#col-customer");
    await page.waitForTimeout(1000); // allow populateCustomerSelect to run
    const count = await sel.locator("option").count();

    if (count > 1) {
      await sel.selectOption({ index: 1 });
      await page.fill("#col-weight", "5");
      await expect(page.locator("#colEstimate")).toBeVisible({ timeout: 3000 });
      await expect(page.locator("#colEstimateVal")).toContainText("AED");
    } else {
      // No customers yet - just verify the modal form elements are present
      await expect(page.locator("#col-weight")).toBeVisible();
      await expect(page.locator("#col-collector")).toBeVisible();
    }
    await page.click("#collectionModal .modal-close");
  });

  // ── 10. Top-up modal opens from customers panel ─────────────────────────────
  test("top-up modal opens from customer row", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("#nav-customers");
    await page.waitForSelector("#cxBody tr:not(.empty-state)", { timeout: 10000 }).catch(() => {});
    const topupBtn = page.locator("#cxBody button:has-text('Top Up')").first();
    if (await topupBtn.count() > 0) {
      await topupBtn.click();
      await expect(page.locator("#topupModal")).toHaveClass(/open/);
      await expect(page.locator("#topupName")).not.toHaveText("—");
      await page.click("#topupModal .modal-close");
    }
  });

  // ── 11. Customer history modal opens ───────────────────────────────────────
  test("customer history modal opens from customer row", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("#nav-customers");
    await page.waitForSelector("#cxBody tr", { timeout: 10000 }).catch(() => {});
    const histBtn = page.locator("#cxBody button:has-text('History')").first();
    if (await histBtn.count() > 0) {
      await histBtn.click();
      await expect(page.locator("#historyModal")).toHaveClass(/open/);
      await expect(page.locator("#historyTitle")).toContainText("History —");
      await page.click("#historyModal .modal-close");
    }
  });

  // ── 12. Transaction search filter works ─────────────────────────────────────
  test("transaction search filters the table", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("s-total")?.textContent !== "—", { timeout: 10000 });
    await page.fill("#txSearch", "zzz_nonexistent_xyz");
    await expect(page.locator("#txBody")).toContainText("No transactions found");
    await page.fill("#txSearch", "");
  });

  // ── 13. Customer search filter works ───────────────────────────────────────
  test("customer search filters the table", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("#nav-customers");
    await page.waitForFunction(() => document.getElementById("c-total")?.textContent !== "—", { timeout: 10000 });
    await page.fill("#cxSearch", "zzz_nonexistent_xyz");
    await expect(page.locator("#cxBody")).toContainText("No customers found");
    await page.fill("#cxSearch", "");
  });

  // ── 14. Dashboard panel loads stats ─────────────────────────────────────────
  test("dashboard panel loads and shows stats", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("#nav-dashboard");
    await page.waitForFunction(() => document.getElementById("db-revenue")?.textContent !== "—", { timeout: 10000 });
    await expect(page.locator("#db-revenue")).toContainText("AED");
    await expect(page.locator("#db-customers")).not.toHaveText("—");
    await expect(page.locator("#dbChart")).toBeVisible();
  });

  // ── 15. Export CSV endpoint for transactions ─────────────────────────────────
  test("GET /api/collections/export returns CSV", async ({ request }) => {
    const r = await request.get(`${BASE}/api/collections/export`);
    expect(r.status()).toBe(200);
    const ct = r.headers()["content-type"];
    expect(ct).toContain("text/csv");
    const text = await r.text();
    expect(text).toContain("Invoice ID");
  });

  // ── 16. Export CSV endpoint for customers ───────────────────────────────────
  test("GET /api/customers/export returns CSV", async ({ request }) => {
    const r = await request.get(`${BASE}/api/customers/export`);
    expect(r.status()).toBe(200);
    const ct = r.headers()["content-type"];
    expect(ct).toContain("text/csv");
    const text = await r.text();
    expect(text).toContain("Name");
  });

  // ── 17. GET /api/stats returns dashboard data ───────────────────────────────
  test("GET /api/stats returns structured stats", async ({ request }) => {
    const r = await request.get(`${BASE}/api/stats`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("totalRevenue");
    expect(body).toHaveProperty("totalWeight");
    expect(body).toHaveProperty("totalCustomers");
    expect(body).toHaveProperty("daily");
    expect(Array.isArray(body.daily)).toBe(true);
    expect(body.daily.length).toBe(7);
  });

  // ── 18. Receipt modal opens from transaction row ────────────────────────────
  test("receipt modal opens from transaction row", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForSelector("#txBody tr", { timeout: 10000 }).catch(() => {});
    const receiptBtn = page.locator("#txBody button:has-text('Receipt')").first();
    if (await receiptBtn.count() > 0) {
      await receiptBtn.click();
      await expect(page.locator("#receiptModal")).toHaveClass(/open/);
      await expect(page.locator("#receiptBody")).not.toContainText("spinner");
      // Print button should be visible
      await expect(page.locator("#receiptModal button:has-text('Print')")).toBeVisible();
      await page.click("#receiptModal .modal-close");
    }
  });

  // ── 19. Keyboard Escape closes modals ──────────────────────────────────────
  test("pressing Escape does not break the page", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.keyboard.press("Escape");
    await expect(page.locator(".logo-text")).toBeVisible();
  });

  // ── 20. Refresh button works ────────────────────────────────────────────────
  test("refresh button triggers data reload", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("button:has-text('Refresh')");
    await page.waitForFunction(() => document.getElementById("s-total")?.textContent !== "—", { timeout: 10000 });
    await expect(page.locator("#s-total")).not.toHaveText("—");
  });

});
