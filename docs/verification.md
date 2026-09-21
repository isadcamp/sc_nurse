# Verification — Sprint 3 — 2026-09-12

ผลตรวจโค้ดปัจจุบันแทนบันทึกการทดสอบ prototype เดิม

- `gofmt -l internal cmd migrations`: ไม่มีไฟล์ค้าง
- `go test ./...` โดยตั้ง `NURSE_MYSQL_TEST=1`: ผ่าน
- `go vet ./...`: ผ่าน
- Domain: กฎ 18 ข้อ, severity/ผล deterministic, ชบ/ดบ, พักเท่าขั้นต่ำ/ต่ำกว่า/0 ชั่วโมง, ลาข้ามวัน, เวรล็อกทับลา, pending leave, คืนซ้ำ, วันต่อเนื่อง, เดือน 28–31 วัน, staffing ทุก segment และชั่วโมงล้ำเดือนถัดไป
- MySQL integration: migration/re-run, unique schedule, boundary/holiday mapping, validation rollback, concurrent edit (หนึ่งสำเร็จหนึ่ง conflict), lock/unlock persistence, rollback เมื่อ audit insert ล้มเหลว และจำนวน audit
- Integration สร้างฐานชั่วคราว `nurse_s3_*_test` และลบเฉพาะฐานนั้น ไม่เขียนข้อมูลใน `nurse`
- HTTP/API: check/edit/lock/unlock/boundary/validate/list, stale version, authorization, JSON ผิด/เกินขนาด/unknown/trailing, Content-Type, วันผิด, hard block, soft save, override/audit
- OpenAPI response contract test: Result, Report และ Error ตรง schema
- Frontend `npm run lint` และ `npm run build`: ผ่าน
- Playwright Chromium `npm test`: **4 passed**, process exit 0
  1. สร้างเดือน แก้เวร ตรวจ ล็อก/ปลดล็อก
  2. เดือน 28/29/30/31 วัน
  3. ปฏิเสธรหัสเข้าใช้งานไม่ถูกต้อง
  4. hard violation บล็อก save จน head ระบุ override และเหตุผล
- E2E ใช้ synthetic HTTP fixture; MySQL ได้ตรวจแยกใน integration tests
- ภาพหน้าตาราง: `tests/e2e/test-results/sprint3-monthly.png` (generated, ไม่เข้า Git)

ก่อนใช้งานกับข้อมูลจริง: provision credentials, policy ของหน่วยงาน และ periods ของเวร ตาม `docs/sprint3-operations.md` รอบนี้ไม่ได้ deploy/migrate ฐาน nurse และไม่ได้เชื่อม SSO โรงพยาบาล

AUTO/approval workflows เป็น Sprint 4/6; validator กลางพร้อมให้ workflow เหล่านั้นเรียกใช้ ส่วนหน้าจอจัดการข้อมูลพื้นฐานของ Sprint 2 ที่ยังเป็น stub ไม่ได้ถูกนับว่าเสร็จจากงาน Sprint 3
