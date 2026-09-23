import { expect, test, type Page } from "@playwright/test";

async function openBoundary(page: Page, count = 3, month = 9, year = 2026) {
  const date = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  const schedule = {
    id: 1, wardId: "test-ward", month, year, status: "draft", version: 1, timezone: "Asia/Bangkok", assignments: [], holidays: [],
    staff: Array.from({ length: count }, (_, i) => ({ id: `n-${i}`, name: `บุคลากรทดสอบ ${i + 1}`, position: i % 2 ? "PN" : "RN", active: true, skills: [] })),
    boundary: [{ nurseId: "n-0", date, shiftCode: "X" }, { nurseId: "n-2", date, shiftCode: "OLD" }],
    shifts: [{ code: "ช", name: "เช้า", periods: [{ start: 480, end: 960 }] }, { code: "ด", name: "ดึก", periods: [{ start: 1200, end: 1920 }] }, { code: "X", name: "หยุด", periods: [] }],
    policy: { minRestHours: 8, maxConsecutiveDays: 6, maxConsecutiveNights: 3, minOff: 4, maxMonthlyHours: 240, maxContinuousHours: 16, maxDoubleShifts: 8, nightStart: 1320, nightEnd: 1800, fairnessHours: 48, weights: { coverage: 100, fairness: 50, preference: 20, stability: 10 } },
  };
  const writes: { date: string; shifts: Record<string, string> }[] = [];
  const state = { fail: false };
  const response = () => ({ schedule, report: { violations: [], hours: [], canSave: true } });
  await page.route("**/api/v1/**", async route => {
    const req = route.request(); const path = new URL(req.url()).pathname.split("/api/v1")[1];
    let body: unknown = { data: [] };
    if (path === "/auth/me") body = { id: "test-head", role: "head", wards: ["test-ward"] };
    else if (path === "/wards") body = { data: [{ id: "test-ward", name: "หอผู้ป่วยทดสอบ", timezone: "Asia/Bangkok" }] };
    else if (path.endsWith("/readiness-check")) body = { ready: true, revision: "test", issues: [], excludedShifts: [] };
    else if (path === "/schedules/1/boundary-shifts") {
      if (state.fail) { await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "ทดสอบบันทึกไม่สำเร็จ" }) }); return; }
      const payload = req.postDataJSON(); writes.push(payload);
      for (const [id, code] of Object.entries(payload.shifts)) {
        schedule.boundary = schedule.boundary.filter(c => c.nurseId !== id);
        schedule.boundary.push({ nurseId: id, date: payload.date, shiftCode: String(code) });
      }
      body = response();
    } else if (path === "/schedules/1") body = response();
    else if (path.endsWith("/schedules") || path.endsWith("/versions")) body = { data: [schedule] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await expect(async () => {
    await page.getByRole("button", { name: "รหัส Token (Direct)" }).click();
    await expect(page.getByPlaceholder("กรอก Token ประจำตัว")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await page.getByPlaceholder("กรอก Token ประจำตัว").fill("synthetic-boundary-token");
  await page.getByRole("button", { name: "ยืนยันรหัสเข้าใช้งาน" }).click();
  await page.locator('input[type="month"]').fill(`${year}-${String(month).padStart(2, "0")}`);
  await page.getByRole("button", { name: "เปิดตาราง", exact: true }).click();
  await page.getByRole("button", { name: "เวรวันก่อนหน้า", exact: true }).click();
  await expect(page.getByRole("heading", { name: "เวรวันสุดท้ายของเดือนก่อน", exact: true })).toBeVisible();
  return { writes, state, schedule, date };
}

const shift = (page: Page, n: number) => page.getByLabel(`เวรวันก่อนหน้า บุคลากรทดสอบ ${n}`, { exact: true });

test("missing is not OFF; save only edits and preserve legacy history", async ({ page }) => {
  const { writes, schedule } = await openBoundary(page);
  await expect(shift(page, 1)).toHaveValue("X");
  await expect(shift(page, 2)).toHaveValue("");
  await expect(shift(page, 3)).toHaveValue("OLD");
  await expect(shift(page, 2).locator('option[value="D"]')).toHaveCount(0);
  await expect(shift(page, 2).locator('option[value="ด"]')).toContainText("20:00–08:00 วันถัดไป");
  await shift(page, 2).selectOption("ด");
  await page.getByRole("button", { name: "บันทึกการแก้ไข 1 คน", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "บันทึกเวรวันก่อนหน้าแล้ว 1 คน" })).toBeVisible();
  expect(writes).toEqual([{ date: "2026-08-31", shifts: { "n-1": "ด" } }]);
  expect(schedule.boundary.find(c => c.nurseId === "n-2")?.shiftCode).toBe("OLD");
  await expect(page.getByRole("heading", { name: "เวรวันสุดท้ายของเดือนก่อน", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึกการแก้ไข 0 คน", exact: true })).toBeDisabled();
});

test("filtered bulk selection does not overwrite others; edits survive filters", async ({ page }) => {
  const { writes } = await openBoundary(page, 6);
  await page.getByLabel("กลุ่มบุคลากร", { exact: true }).selectOption("PN");
  await page.getByLabel("เลือกทุกคนที่แสดง", { exact: true }).check();
  await page.getByLabel("เวรสำหรับคนที่เลือก", { exact: true }).selectOption("ช");
  await page.getByRole("button", { name: "กำหนดให้ 3 คนที่เลือก", exact: true }).click();
  await page.getByLabel("กลุ่มบุคลากร", { exact: true }).selectOption("all");
  await expect(shift(page, 1)).toHaveValue("X"); await expect(shift(page, 3)).toHaveValue("OLD");
  await expect(shift(page, 5)).toHaveValue(""); await expect(shift(page, 4)).toHaveValue("ช");
  await page.getByLabel("ค้นหาบุคลากร", { exact: true }).fill("ไม่มีรายชื่อ");
  await expect(page.getByText("ไม่พบรายชื่อที่ตรงกับตัวกรอง", { exact: true })).toBeVisible();
  await page.getByLabel("ค้นหาบุคลากร", { exact: true }).fill("");
  await page.getByRole("button", { name: "บันทึกการแก้ไข 3 คน", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].shifts).toEqual({ "n-1": "ช", "n-3": "ช", "n-5": "ช" });
  await expect(shift(page, 5)).toHaveValue("");
});

test("failure keeps edits, retry works, missing navigation and undo", async ({ page }) => {
  const { writes, state } = await openBoundary(page);
  await page.getByRole("button", { name: "ไปคนถัดไปที่ยังไม่ระบุ", exact: true }).click();
  await expect(shift(page, 2)).toBeFocused();
  await shift(page, 2).selectOption("ช");
  await page.getByLabel("สถานะการกรอก", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "คืนค่าเดิม บุคลากรทดสอบ 2", exact: true }).click();
  await expect(shift(page, 2)).toHaveValue("");
  await shift(page, 2).selectOption("ช"); state.fail = true;
  await page.getByRole("button", { name: "บันทึกการแก้ไข 1 คน", exact: true }).click();
  await expect(page.locator(".boundary-error")).toBeVisible();
  await expect(shift(page, 2)).toHaveValue("ช"); expect(writes).toHaveLength(0);
  state.fail = false;
  await page.getByRole("button", { name: "บันทึกการแก้ไข 1 คน", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
});

test("30 staff on one page, leap month date and mobile layout", async ({ page }, testInfo) => {
  await openBoundary(page, 30, 3, 2024);
  await expect(page.locator(".boundary-table tbody tr")).toHaveCount(30);
  await expect(page.getByRole("columnheader", { name: "เวรวันที่ 2024-02-29" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("boundary-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("boundary-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "ไปคนถัดไปที่ยังไม่ระบุ", exact: true }).click();
  await expect(shift(page, 2)).toBeFocused();
});
