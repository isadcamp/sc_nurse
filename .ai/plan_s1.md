# Sprint 1 — ฐานข้อมูล, Domain หลัก และแบบเวร

สถานะ: ยังไม่เริ่ม
ที่มา: [plan.md](plan.md) ระยะ 1 | มาตรฐาน: [rule.md](rule.md)

## เป้าหมาย

วางรากฐานระบบโดยเชื่อม MySQL, สร้าง domain model ที่สมบูรณ์, และ API สำหรับจัดการหน่วยงาน บุคลากร และแบบเวรหลายช่วง แทนที่ข้อมูลจำลองในโค้ดปัจจุบัน

## สิ่งที่ส่งมอบ

### 1. MySQL Database `nurse`

- สร้าง database `nurse` ด้วย `utf8mb4` collation
- สร้าง `nurse_test` สำหรับ integration tests
- Connection อ่านจาก environment variables (host, port, user, password)
- Timezone ของ connection เป็น UTC; วันปฏิทินเก็บ `DATE`
- Migration framework พร้อมลำดับชัด, ชื่อสื่อความหมาย, มีวิธี rollback

### 2. Domain Model

#### หน่วยงาน (Ward)
- `WardID`, ชื่อ, timezone (`Asia/Bangkok` เป็น default)
- หน่วยงานเป็น scope หลักของตาราง, บุคลากร และการตั้งค่า

#### บุคลากร (Nurse)
- `NurseID`, ชื่อ, ตำแหน่ง (RN/PN), หน่วยงาน
- ทักษะ (skills)
- ความสามารถเป็นหัวหน้าเวร (แยกจากตำแหน่ง — RN ไม่ได้หมายความว่าเป็นหัวหน้าได้ทุกคน)
- ชนิดเวรที่ขึ้นได้
- สิทธิ์ขึ้นเวรควบ (ต้องหัวหน้าอนุญาต)
- สถานะ active/inactive

#### แบบเวร (ShiftType) — หลายช่วง

| รหัส | ช่วงปฏิบัติงาน | ชั่วโมง | หมายเหตุ |
|------|---------------|--------:|----------|
| ช | 08:00–16:00 | 8 | เวรเช้า |
| บ | 16:00–00:00 วันถัดไป | 8 | เวรบ่าย |
| ด | 00:00–08:00 | 8 | เวรดึก |
| ชบ | 08:00–00:00 วันถัดไป ต่อเนื่อง | 16 | เวรควบต่อเนื่อง |
| ดบ | 00:00–08:00 + 16:00–00:00 | 16 | เวรควบสองช่วง (พัก 8h ตรงกลาง) |
| Day | 08:00–20:00 | 12 | — |
| Night | 20:00–08:00 วันถัดไป | 12 | — |
| X | OFF | 0 | ไม่มีเวรเริ่มวันนั้น |
| L | วันลาที่อนุมัติ | 0 | ห้ามทับเวร |

กฎที่ต้อง enforce ใน domain:
- หนึ่งคนมีหนึ่งรายการต่อวัน (เวรเดี่ยว / เวรควบ / X / L)
- ชบ เป็นงานต่อเนื่อง 16h → ตรวจเพดานงานต่อเนื่อง ไม่ใช่พักระหว่าง ช+บ
- ดบ เป็นสองช่วง มีพัก 8h ตรงกลาง → ตรวจแต่ละช่วงกับเวรวันก่อน/ถัดไป
- X อาจมี Night จากวันก่อนมาจบตอนเช้า
- L ต้องไม่มีช่วงงานทับวันที่ลา
- แต่ละหน่วยเลือกเปิด/ปิดชนิดเวรได้

### 3. Repository Interfaces

- `WardRepository` — `FindByID`, `FindAll`, `Save`
- `NurseRepository` — `FindByID`, `FindByWard`, `FindActiveNurses`, `Save`, `Update`
- `ShiftTypeRepository` — `FindByWard`, `FindEnabled`, `Save`
- ใช้ภาษา domain ไม่เปิดเผย SQL abstraction
- Application service กำหนด transaction boundary

### 4. Database Migrations

ตารางเป้าหมาย (migration ลำดับชัด):

```
001_create_wards
002_create_nurses
003_create_shift_types
004_create_shift_type_periods  (ช่วงเวลาของแต่ละแบบเวร)
005_create_nurse_shift_permissions  (เวรที่แต่ละคนขึ้นได้)
006_create_nurse_skills
```

- Foreign keys, unique constraints, indexes ที่จำเป็น
- Optimistic locking (version column) สำหรับ nurse/shift_type
- Audit columns: `created_at`, `updated_at`, `created_by`, `updated_by`

### 5. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/wards` | รายการหน่วยงาน |
| `GET` | `/api/v1/wards/:id` | หน่วยงานตาม ID |
| `POST` | `/api/v1/wards` | สร้างหน่วยงาน |
| `GET` | `/api/v1/wards/:id/nurses` | บุคลากรในหน่วย |
| `POST` | `/api/v1/nurses` | เพิ่มบุคลากร |
| `PUT` | `/api/v1/nurses/:id` | แก้ไขบุคลากร |
| `GET` | `/api/v1/wards/:id/shift-types` | แบบเวรของหน่วย |
| `POST` | `/api/v1/shift-types` | สร้างแบบเวร |
| `PUT` | `/api/v1/shift-types/:id` | แก้ไขแบบเวร |

- ทุก endpoint อัปเดต `docs/openapi.yaml`
- Error response ใช้โครงสร้างคงที่ตาม rule.md §7
- Pagination สำหรับ collection endpoints
- Request body validation: Content-Type, ขนาด, unknown fields, required fields, range

### 6. Frontend Updates

- หน้าจัดการหน่วยงาน (CRUD)
- หน้าจัดการบุคลากร (เพิ่ม/แก้/ดูรายการ)
- หน้าจัดการแบบเวร (เปิด/ปิด ดูช่วงเวลา)
- เปลี่ยนจาก hard-coded nurses → ดึงจาก API
- API types สร้างจาก OpenAPI

### 7. Application Entry Point

- เพิ่ม MySQL connection ที่ `cmd/api/main.go`
- Dependency injection ที่ composition root
- Health endpoint แยก liveness/readiness (ตรวจ DB connection)
- Graceful shutdown

## ข้อกำหนดทางเทคนิค

- ห้าม domain import httpapi หรือ database driver
- ห้าม handler เข้า DB โดยตรง
- Entity ต้องมี identity คงที่ (`WardID`, `NurseID`)
- Value objects สำหรับ `ShiftCode`, `Position` (RN/PN), `TimeRange`
- ป้องกัน invalid state ที่จุดสร้าง
- ใช้ parameterized queries ทั้งหมด
- Test fixtures ใช้ข้อมูลสมมติเท่านั้น

## การทดสอบ

- Domain unit tests: สร้าง entity ถูก/ผิด, shift type validation, ช่วงเวลาซ้อน
- Repository integration tests: CRUD, constraints, mapping (ใช้ `nurse_test`)
- HTTP/API tests: success, malformed JSON, unknown fields, missing fields, invalid range
- ตรวจ `gofmt`, `go test ./...`, `go vet ./...`
- Frontend: `npm run lint`, `npm run build`

## Definition of Done

- [ ] MySQL `nurse` สร้างได้ผ่าน migration
- [ ] Domain model: Ward, Nurse, ShiftType พร้อม validation
- [ ] Repository interfaces + MySQL implementations ผ่าน integration tests
- [ ] API endpoints ทั้งหมดผ่าน HTTP tests
- [ ] OpenAPI อัปเดตตรงกับ implementation
- [ ] Frontend แสดงข้อมูลจาก DB แทน hard-coded
- [ ] ไม่มี secret/personal data ใน source code
- [ ] Error, loading, empty states ใช้งานได้
