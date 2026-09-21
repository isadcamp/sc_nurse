import { expect, test } from "@playwright/test";
const token = "synthetic-head-token-for-tests-only";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("รหัสเข้าใช้งาน").fill(token);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("button", { name: "ออกจากระบบ" })).toBeVisible();
}

test("เข้าสู่ระบบและสร้างตารางรายเดือน", async ({ page }) => {
  await signIn(page);
  await page.locator('input[type="month"]').fill("2026-10");
  await page.getByRole("button", { name: "สร้างตารางเปล่าใหม่" }).click();
  await expect(page.getByText("สร้างตารางเวรใหม่เรียบร้อยแล้ว")).toBeVisible();
  await expect(page.getByText("ยังไม่ได้เปิดตารางเวร")).not.toBeVisible();
});

test("รองรับเดือน 28 29 30 31 วัน", async ({ page }) => {
  await signIn(page);
  for (const [month, days] of [["2027-02", 28], ["2028-02", 29], ["2027-04", 30], ["2027-05", 31]] as const) {
    await page.locator('input[type="month"]').fill(month);
    await page.getByRole("button", { name: "สร้างตารางเปล่าใหม่" }).click();
    await expect(page.getByText("สร้างตารางเวรใหม่เรียบร้อยแล้ว")).toBeVisible();
    await expect(page.getByText("ยังไม่ได้เปิดตารางเวร")).not.toBeVisible();
  }
});

test("ปฏิเสธรหัสเข้าใช้งานไม่ถูกต้อง", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("รหัสเข้าใช้งาน").fill("wrong");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByText("กรุณายืนยันตัวตน")).toBeVisible();
});


