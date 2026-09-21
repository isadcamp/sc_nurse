import { expect, test } from "@playwright/test";

const token = "synthetic-head-token-for-tests-only";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("รหัสเข้าใช้งาน").fill(token);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("button", { name: "ออกจากระบบ" })).toBeVisible();
}

test("ตรวจสอบความพร้อมและจัดเวรอัตโนมัติ AUTO", async ({ page }) => {
  await signIn(page);

  // Set month to 2026-09 and open the schedule
  await page.locator('input[type="month"]').fill("2026-09");
  await page.getByRole("button", { name: "เปิดตาราง", exact: true }).click();
  await expect(page.getByRole("button", { name: /จัดเวร AI/ })).toBeVisible({ timeout: 10000 });

  // Open the AI / Auto solver modal
  await page.getByRole("button", { name: /จัดเวร AI/ }).click();
  await expect(page.getByText("AUTO และการจำลอง")).toBeVisible();

  // 1. Click "ตรวจความพร้อม AUTO"
  await page.getByRole("button", { name: "ตรวจความพร้อม AUTO" }).click();
  await expect(page.getByText("พร้อมเริ่มจัด — ยังไม่รับประกันว่าจะจัดครบ")).toBeVisible({ timeout: 10000 });

  // 2. Click "เริ่ม AUTO"
  await page.getByRole("button", { name: "เริ่ม AUTO" }).click();

  // 3. Wait for solver job to complete and display the proposal score & table
  await expect(page.getByText("ผล: complete")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("คะแนนก่อน–หลัง")).toBeVisible();

  // 4. Click "ใช้ผล AUTO กับตาราง" to apply assignments
  const applyBtn = page.getByRole("button", { name: "ใช้ผล AUTO กับตาราง" });
  await expect(applyBtn).toBeEnabled();
  await applyBtn.click();

  // 5. Verify the modal closes or shows applied state
  await expect(page.getByText("จัดตารางเวรอัตโนมัติ")).not.toBeVisible();
});

test("จำลองการจัดเวรด้วยชุดตั้งค่าปัจจุบัน (Simulation mode)", async ({ page }) => {
  await signIn(page);

  // Set month to 2026-09 and open the schedule
  await page.locator('input[type="month"]').fill("2026-09");
  await page.getByRole("button", { name: "เปิดตาราง", exact: true }).click();
  await expect(page.getByRole("button", { name: /จัดเวร AI/ })).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: /จัดเวร AI/ }).click();
  await expect(page.getByText("AUTO และการจำลอง")).toBeVisible();

  // Toggle simulation mode checkbox
  await page.getByLabel("จำลองด้วยชุดตั้งค่าปัจจุบัน (รองรับร่าง)").check();
  await expect(page.getByRole("button", { name: "เริ่มจำลอง" })).toBeVisible();

  // Start simulation
  await page.getByRole("button", { name: "เริ่มจำลอง" }).click();

  // Wait for result
  await expect(page.getByText(/ผล:/)).toBeVisible({ timeout: 15000 });

  // Apply button should be disabled for simulation jobs
  const applyBtn = page.getByRole("button", { name: "ใช้ผล AUTO กับตาราง" });
  await expect(applyBtn).toBeDisabled();
});
