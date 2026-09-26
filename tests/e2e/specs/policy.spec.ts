import { expect, test, type Page } from "@playwright/test";

async function openPolicy(page: Page) {
  const schedule = {
    id: 1, wardId: "test-ward", month: 9, year: 2026, status: "draft", version: 1, timezone: "Asia/Bangkok",
    assignments: [], boundary: [], holidays: [],
    staff: [{ id: "test-a", name: "พยาบาลทดสอบ A", position: "RN", active: true, leader: true, double: true, skills: [] },
      { id: "test-b", name: "ผู้ช่วยทดสอบ B", position: "PN", active: true, skills: [] }],
    shifts: [{ code: "ช", name: "เช้า", periods: [{ start: 480, end: 960 }] }, { code: "X", name: "OFF", periods: [] }],
    policy: { status: "confirmed", version: "test-v1", effectiveFrom: "2026-09-01", effectiveTo: "2026-09-30",
      minOff: 4, minRestHours: 8, maxConsecutiveDays: 6, maxConsecutiveNights: 3, maxConsecutiveOffDays: 2,
      compressOffOnShortage: false, allowOTOnShortage: false, maxMonthlyHours: 240, maxContinuousHours: 16,
      maxDoubleShifts: 8, nightStart: 1320, nightEnd: 1800, fairnessHours: 48,
      weights: { coverage: 100, fairness: 50, preference: 20, stability: 10 },
      staffing: [{ date: "", start: 480, end: 960, rn: 2, pn: 1, leaders: 1, skills: null }],
      targets: [{ nurseId: "test-a", hours: 160, off: 8, quotas: {} }, { nurseId: "test-b", hours: 160, off: 8, quotas: {} }], preferences: [] },
  };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/v1/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname.split("/api/v1")[1];
    let body: unknown = { data: [] };
    if (path === "/auth/me") body = { id: "test-head", role: "head", wards: ["test-ward"] };
    else if (path.endsWith("/readiness-check")) body = { ready: true, revision: "test", policyVersion: "test-v1", excludedShifts: [], issues: [] };
    else if (path === "/wards") body = { data: [{ id: "test-ward", name: "หอผู้ป่วยทดสอบ", timezone: "Asia/Bangkok" }] };
    else if (path === "/wards/test-ward/roster-policy" && req.method() === "PUT") {
      const payload = req.postDataJSON(); writes.push(payload); schedule.policy = payload; body = payload;
    } else if (path === "/schedules/1") body = { schedule, report: { violations: [], hours: [], canSave: true } };
    else if (path.endsWith("/schedules") || path.endsWith("/versions")) body = { data: [schedule] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "รหัส Token (Direct)" }).click();
  await page.getByPlaceholder("กรอก Token ประจำตัว").fill("synthetic-policy-token");
  await page.getByRole("button", { name: "ยืนยันรหัสเข้าใช้งาน" }).click();
  await page.locator('input[type="month"]').fill("2026-09");
  await page.getByRole("button", { name: "เปิดตาราง", exact: true }).click();
  await page.getByRole("button", { name: "กฎการจัดเวร", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1. แต่ละผลัดต้องใช้กี่คน" })).toBeVisible();
  return writes;
}

test("policy guidance, staffing arithmetic and save preserve policy data", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const writes = await openPolicy(page);
  await expect(page.getByText("ต้องมี RN รวม 3 คน + PN 1 คน = 4 คน", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /OT เมื่อคนไม่พอ/ })).toBeDisabled();
  await page.getByLabel("พักขั้นต่ำระหว่างเวร (ชม.):", { exact: true }).fill("10");
  await expect(page.getByRole("status").filter({ hasText: "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" })).toBeVisible();
  await page.getByRole("button", { name: /บันทึกและยืนยันนโยบาย/ }).first().click();
  await expect(page.getByText("💾 บันทึกนโยบายและเงื่อนไขการจัดเวรเรียบร้อยแล้ว", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ minRestHours: 10, status: "confirmed", allowOTOnShortage: false, minOff: 4, effectiveFrom: "2026-09-01" });
  await expect(page.getByRole("status").filter({ hasText: "ยังไม่มีการแก้ไขที่รอบันทึก" })).toBeVisible();
  await page.locator("#policy-staffing").screenshot({ path: testInfo.outputPath("policy-staffing.png") });
  await page.locator("#policy-limits").screenshot({ path: testInfo.outputPath("policy-limits.png") });
  expect(errors).toEqual([]);
});

test("invalid advanced staffing stays editable and cannot be saved", async ({ page }) => {
  const writes = await openPolicy(page);
  await page.getByRole("button", { name: /ขั้นสูง: JSON/ }).click();
  const editor = page.getByLabel("อัตรากำลังตามช่วงเวลา JSON");
  await editor.fill('[{"rn":2}]');
  await page.getByRole("button", { name: "ตาราง", exact: true }).click();
  await expect(editor).toHaveValue('[{"rn":2}]');
  await page.getByRole("button", { name: /บันทึกและยืนยันนโยบาย/ }).first().click();
  await expect(page.getByRole("alert").filter({ hasText: "ข้อมูลอัตรากำลังไม่ถูกต้อง" })).toBeVisible();
  expect(writes).toHaveLength(0);
  await editor.fill('[{"date":"","start":1200,"end":1920,"rn":1,"pn":0,"leaders":1,"skills":{}}]');
  await page.getByRole("button", { name: "ตาราง", exact: true }).click();
  await expect(page.getByText("ต้องมี RN รวม 2 คน + PN 0 คน = 2 คน", { exact: true })).toBeVisible();
});
