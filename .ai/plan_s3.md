# Sprint 3 — ตารางเดือน, การแก้/ล็อกเวร และตัวตรวจสอบ

สถานะ: พัฒนาและทดสอบแล้ว (2026-09-12) — ต้องตั้งค่า credentials/policy/ช่วงเวลาเวรก่อนใช้ข้อมูลจริง
ที่มา: [plan.md](plan.md) ระยะ 3 | มาตรฐาน: [rule.md](rule.md)
ต้องการ: Sprint 2 เสร็จสมบูรณ์

## เป้าหมาย

สร้างตารางเวรรายเดือนที่แก้ไขด้วยมือได้ ล็อกเวรได้ พร้อมตัวตรวจสอบ (Validation Engine) ที่ใช้ชุดกฎเดียวกันทุกจุด และจัดการข้อมูลรอยต่อเดือน

## สิ่งที่ส่งมอบ

### 1. ตารางเวรรายเดือน (Monthly Schedule)

- แถว = บุคลากร, คอลัมน์ = วันที่ (1–28/29/30/31)
- หนึ่งคนหนึ่งรายการต่อวัน (เวรเดี่ยว / เวรควบ / X / L)
- สถานะตาราง: `draft`
- กรองหน่วยงาน, เดือน, ปี
- แสดงสีและคำอธิบายชนิดเวร, สีวันหยุด

### 2. การแก้เวรด้วยมือ (Manual Edit)

- เลือกเซลล์ → เลือกชนิดเวร / X / L
- ก่อนบันทึก → backend ตรวจผลกระทบทันที
- แสดงผล:
  - 🔴 สีแดง + รหัส + คำอธิบาย → ข้อบังคับที่ผิด (hard constraint violation)
  - 🟡 สีเตือน → ความต้องการ/เป้าหมายที่ยังไม่ถึง (soft constraint)
  - ระบุ: วันที่, เวร, บุคลากร, กฎที่เกี่ยวข้อง
- ใช้ข้อความ + สัญลักษณ์ร่วมกับสี (ไม่พึ่งสีอย่างเดียว — accessibility)
- บันทึกได้แม้มี soft violation; บล็อกเมื่อมี hard violation (ยกเว้น workflow override ที่มีสิทธิ์ เหตุผล และ audit)

### 3. ล็อกเวร (Lock Assignments)

- หัวหน้าล็อกเวรที่ยืนยันแล้ว
- เวรล็อก: ไม่ถูกเปลี่ยนโดย AUTO, แสดงเครื่องหมายล็อก 🔒
- ล็อก/ปลดล็อก เป็น explicit action พร้อม audit

### 4. Validation Engine (ตัวตรวจสอบ)

**หลักการ**: กฎชุดเดียวใช้กับ AUTO, การแก้มือ, และการตรวจอนุมัติ

#### กฎที่ต้อง implement

ทุกกฎมีรหัสคงที่, unit test อิสระ, ระบุ hard/soft:

**Hard Constraints (ข้อบังคับ)**:
- `NO_OVERLAP` — ไม่ซ้อนเวลา
- `NO_LEAVE_OVERLAP` — ไม่ทับลาที่อนุมัติ
- `STAFF_PERMISSION` — สิทธิ์บุคลากรตรงกับเวร
- `LOCKED_PRESERVED` — รักษาเวรล็อก
- `ONE_ASSIGNMENT_PER_DAY` — หนึ่งรายการต่อวัน
- `DOUBLE_SHIFT_PERMISSION` — เวรควบต้องมีสิทธิ์

**Configurable Hard Constraints** (ค่าจากการตั้งค่า):
- `MIN_REST_HOURS` — เวลาพักขั้นต่ำ (ตรวจจากเวลาจริง)
- `MAX_CONSECUTIVE_DAYS` — วันทำงานติดกันสูงสุด
- `MAX_CONSECUTIVE_NIGHTS` — เวรกลางคืนติดกันสูงสุด
- `MAX_MONTHLY_HOURS` — เพดานชั่วโมงต่อเดือน
- `MAX_CONTINUOUS_HOURS` — ชั่วโมงต่อเนื่องสูงสุด
- `MAX_DOUBLE_SHIFTS` — เพดานเวรควบต่อเดือน
- `MIN_STAFFING` — อัตรากำลังขั้นต่ำตามช่วงเวลา

**Soft Constraints** (เป้าหมาย/ความต้องการ):
- `TARGET_HOURS` — ชั่วโมงเป้าหมาย
- `TARGET_OFF` — OFF เป้าหมาย
- `PREFERENCE` — ความต้องการรายบุคคล
- `FAIRNESS` — การกระจายภาระ
- `SHIFT_QUOTA` — โควตาตามชื่อเวร

#### Rule Violation Report

```go
type RuleViolation struct {
    RuleCode    string      // e.g. "MIN_REST_HOURS"
    Severity    string      // "error" | "warning"
    Date        string      // วันที่เกี่ยวข้อง
    ShiftCode   string      // เวรที่เกี่ยวข้อง
    SubjectID   string      // NurseID
    Message     string      // ข้อความที่ปลอดภัยสำหรับผู้ใช้
    Metadata    map[string]any // ข้อมูลเพิ่มเติม
}
```

#### การตรวจเวลาพักข้ามวัน

- บ (16:00–00:00) ต่อ ด วันถัดไป (00:00–08:00) = พัก 0 ชั่วโมง → ผิด
- ด (00:00–08:00) ต่อ ช (08:00–16:00) = พัก 0 ชั่วโมง → ผิด
- ชบ ต่อเนื่อง 16h → ตรวจเพดานงานต่อเนื่อง
- ดบ สองช่วง → ตรวจแต่ละช่วงกับเวรวันก่อน/ถัดไป

#### การนับกลางคืน

- ใช้ช่วงคืนจริง (ไม่ใช่ชื่อเวร)
- Night วันที่ 9 + ด วันที่ 10 = คืนวันที่ 9 เดียวกัน → นับไม่ซ้ำ
- แสดงชั่วโมงกลางคืนแยก

### 5. ข้อมูลรอยต่อเดือน (Cross-month Boundary)

- โหลดเวรท้ายเดือนก่อน → ตรวจพัก, วันต่อเนื่อง, เวรกลางคืน
- ชั่วโมงข้ามเดือน: นับตามส่วนเวลาที่เกิดขึ้นจริงภายในเดือนนั้น
- แสดงชั่วโมงยกมา/ล้ำไปเดือนข้างเคียงแยก
- ขอบเขตย้อนหลัง 7 วัน / 24 ชั่วโมง = ช่วงเลื่อนตามเวลาจริง
- ใช้เวลาแบบช่วง [start, end) ไม่นับขอบเขตซ้ำ

### 6. วันทำงานต่อเนื่อง

- นับจากวันที่ในตารางที่มีงาน
- ดบ = หนึ่งวัน (ไม่เพิ่มเพราะมีสองช่วง)
- ใช้ประวัติก่อนเริ่มเดือนร่วมด้วย

### 7. API Endpoints ใหม่

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/wards/:id/schedules` | ตารางของหน่วย (กรองเดือน/ปี) |
| `POST` | `/api/v1/schedules` | สร้างตารางเปล่า (draft) |
| `GET` | `/api/v1/schedules/:id` | ดูตาราง + assignments |
| `PUT` | `/api/v1/schedules/:id/assignments` | แก้เวร (single cell) |
| `POST` | `/api/v1/schedules/:id/validate` | ตรวจตารางทั้งหมด |
| `POST` | `/api/v1/schedules/:id/assignments/:assignmentId/check` | ตรวจผลกระทบเวรเดียว |
| `PUT` | `/api/v1/schedules/:id/assignments/:assignmentId/lock` | ล็อกเวร |
| `PUT` | `/api/v1/schedules/:id/assignments/:assignmentId/unlock` | ปลดล็อก |
| `GET` | `/api/v1/schedules/:id/boundary-data` | ข้อมูลรอยต่อเดือน |
| `GET` | `/api/v1/schedules/:id/violations` | รายการ violations ทั้งหมด |

### 8. Frontend

- หน้าตารางรายเดือน (grid: แถว=คน, คอลัมน์=วัน)
- Modal/dropdown เลือกเวรต่อเซลล์
- แสดง violations inline (สีแดง/เตือน + icon + ข้อความ)
- ปุ่มล็อก/ปลดล็อก พร้อมเครื่องหมาย 🔒
- ตรวจผลกระทบแบบ real-time (เรียก API ก่อนบันทึก)
- สีวันหยุดพิเศษบนหัวคอลัมน์
- แสดงสรุป violations ด้านบน/ล่างตาราง

## Database Migrations

```
016_create_schedules
017_create_schedule_assignments
018_create_assignment_locks
019_create_schedule_boundary_data
```

- `schedule_assignments`: schedule_id, nurse_id, date, shift_code, version (optimistic lock)
- `assignment_locks`: assignment_id, locked_by, locked_at

## การทดสอบ

### กฎที่ต้องทดสอบอย่างละเอียด

- ชบ ทำงานต่อเนื่อง 16h vs ดบ สองช่วงพัก 8h
- บ ต่อ ด วันถัดไป = พัก 0 → ผิด
- ด ต่อ ช = พัก 0 → ผิด
- พักเท่าขั้นต่ำ / ต่ำกว่าขั้นต่ำ
- เวรควบเกินสิทธิ์/เพดาน
- Night + ด ผสมกัน → นับคืนไม่ซ้ำ
- รอยต่อเดือน (ท้ายเดือน/ต้นเดือน)
- อัตรากำลัง RN/PN หัวหน้าทักษะครบทุกช่วง
- เดือน 28–31 วัน
- ลาทับเวรข้ามวัน
- OFF ที่มีเวรวันก่อนมาจบ
- เวรล็อก → ไม่ถูกเปลี่ยน + ทับลาไม่ได้

### ระดับการทดสอบ

- Domain unit tests: ทุก rule แยก, boundary cases, deterministic
- Integration tests: validation engine + repository + boundary data
- HTTP/API tests: แก้เวร + check violations + lock/unlock
- `gofmt`, `go test ./...`, `go vet ./...`, frontend lint + build

## Definition of Done

- [x] ตารางรายเดือนแสดงผลถูกต้อง (28–31 วัน)
- [x] แก้เวรด้วยมือ + ตรวจผลกระทบก่อนบันทึก
- [x] ล็อก/ปลดล็อกเวรพร้อม audit
- [x] Validation engine ครบทุกกฎ พร้อม unit tests
- [x] ข้อมูลรอยต่อเดือนถูกต้อง
- [x] การนับกลางคืนไม่ซ้ำ
- [x] OpenAPI อัปเดต
- [x] Frontend ครบ features
- [x] Tests ผ่านทุกระดับ

## ผลการพัฒนา 2026-09-12

- รายละเอียดผลทดสอบ: [verification](../docs/verification.md)
- คู่มือการตั้งค่าและ recovery: [operations](../docs/sprint3-operations.md)
- เพิ่ม migration 020–022 สำหรับ policy, audit และช่วงเวลาเวร
- ข้อมูลรอยต่อคำนวณสดจาก assignments เพื่อไม่ใช้ cache ที่อาจเก่า
- API ใหม่ตามแผนครบ 10 รายการ และเพิ่ม PUT roster-policy สำหรับค่าที่จำเป็น
- AUTO/approval workflow อยู่ Sprint 4/6 โดยให้เรียก validation.Validate ตัวเดียวกัน
- UI/ระบบจัดการ policy แบบเต็มของ Sprint 2 ยังไม่ครบ งานนี้เพิ่มเฉพาะการเชื่อมข้อมูลจริงและการตั้งค่าที่ Sprint 3 จำเป็นต้องใช้
- ทดสอบบนฐาน MySQL ชั่วคราวที่แยกจาก nurse; ยังไม่ได้ deploy/migrate ฐานจริง