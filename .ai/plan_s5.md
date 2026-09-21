# Sprint 5 — Workflow อนุมัติ, รุ่นตาราง และ Audit Trail

สถานะ: เสร็จสมบูรณ์
ที่มา: [plan.md](plan.md) ระยะ 5 | มาตรฐาน: [rule.md](rule.md)
ต้องการ: Sprint 4 เสร็จสมบูรณ์

## เป้าหมาย

สร้าง workflow ครบวงจร ตั้งแต่ตรวจสอบ → อนุมัติ → ประกาศตาราง, ระบบรุ่นตาราง (versioning) และ audit trail ที่ครบถ้วน

## สิ่งที่ส่งมอบ

### 1. Schedule State Machine

```text
draft → generated → under_review → approved → published
          ↑              ↓
          └── (revise) ──┘
```

- Application service MUST บังคับ state transition
- การย้อนสถานะ/แก้หลังอนุมัติ = คำสั่งชัดเจน + audit record
- ร่างที่ขาดกำลังคน / ผิดกฎบังคับ → ส่ง `under_review` ไม่ได้
- ห้ามประกาศตารางที่มี hard constraint violation

#### สถานะและสิทธิ์

| สถานะ | ใครทำได้ | สิ่งที่ทำได้ |
|-------|---------|------------|
| `draft` | หัวหน้าหน่วย | แก้เวร, ล็อก, เริ่ม AUTO |
| `generated` | หัวหน้าหน่วย | ตรวจสอบ, แก้เวร, ส่งตรวจ |
| `under_review` | ผู้อนุมัติ | ตรวจ violations, อนุมัติ/ส่งกลับ |
| `approved` | ผู้มีสิทธิ์ประกาศ | ประกาศ |
| `published` | — | อ่านอย่างเดียว (แก้ต้องสร้างรุ่นใหม่) |

### 2. Workflow Actions

#### ส่งตรวจ (Submit for Review)

- ตรวจ violations ทั้งตาราง
- ต้องไม่มี hard constraint violation
- Soft violations แสดงเป็นคำเตือนให้ผู้อนุมัติพิจารณา
- บันทึก: ผู้ส่ง, เวลา, รุ่นตาราง, สรุป violations

#### อนุมัติ (Approve)

- ผู้อนุมัติตรวจ violations + คะแนน
- กฎเดียวกับ AUTO และการแก้มือ
- บันทึก: ผู้อนุมัติ, เวลา, หมายเหตุ

#### ส่งกลับแก้ไข (Revise)

- ระบุเหตุผลที่ส่งกลับ
- สถานะกลับเป็น `generated` (แก้ต่อได้)
- บันทึก: ผู้ส่งกลับ, เวลา, เหตุผล

#### ประกาศ (Publish)

- ตารางที่ approved → published
- เป็นตารางที่ใช้จริง
- แก้ไขต้องสร้างรุ่นใหม่

### 3. รุ่นตาราง (Schedule Versioning)

- ทุกตารางมี `version` number
- สร้างรุ่นใหม่จากตารางที่ published → draft ใหม่ที่มีข้อมูลจากรุ่นเดิม
- เปรียบเทียบรุ่น: แสดงส่วนที่เปลี่ยน (เพิ่ม/ลบ/แก้)
- อ้างอิง policy version ที่ใช้
- Optimistic locking ป้องกัน lost update เมื่อแก้/อนุมัติพร้อมกัน

### 4. Audit Trail

บันทึกสำหรับทุกเหตุการณ์สำคัญ:

| เหตุการณ์ | ข้อมูลที่บันทึก |
|----------|---------------|
| สร้างตาราง | ผู้สร้าง, หน่วยงาน, เดือน, ปี |
| แก้เวร | ผู้แก้, assignment เดิม/ใหม่, เหตุผล (ถ้ามี) |
| ล็อก/ปลดล็อก | ผู้ล็อก, assignment |
| เริ่ม AUTO | ผู้เริ่ม, policy version, scope |
| ส่งตรวจ | ผู้ส่ง, สรุป violations |
| อนุมัติ | ผู้อนุมัติ, หมายเหตุ |
| ส่งกลับ | ผู้ส่งกลับ, เหตุผล |
| ประกาศ | ผู้ประกาศ |
| สร้างรุ่นใหม่ | ผู้สร้าง, รุ่นต้นทาง |

ทุก record: ผู้กระทำ, เวลา (UTC), การกระทำ, object ID, ไม่เก็บ secret

### 5. Authentication & Authorization

- ทุก endpoint ต้อง authentication (ยกเว้น health)
- Authorization ตรวจ role + หน่วยงาน:
  - **Admin** → กำหนดนโยบายกลาง
  - **Head Nurse** → จัดตาราง, แก้เวร, ส่งตรวจ ในหน่วยงานตัวเอง
  - **Approver** → อนุมัติ/ส่งกลับ
  - **Nurse** → ดูตารางตัวเอง, ขอลา
- สิทธิ์ข้ามหน่วย: ตรวจทุก API call

### 6. Idempotency

- Command ที่อาจถูกส่งซ้ำ (approve, publish, submit) → รองรับ idempotency
- ใช้ idempotency key หรือ state check

### 7. API Endpoints ใหม่/ปรับ

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/schedules/:id/submit-review` | ส่งตรวจ |
| `POST` | `/api/v1/schedules/:id/approve` | อนุมัติ |
| `POST` | `/api/v1/schedules/:id/revise` | ส่งกลับแก้ไข |
| `POST` | `/api/v1/schedules/:id/publish` | ประกาศ |
| `POST` | `/api/v1/schedules/:id/new-version` | สร้างรุ่นใหม่ |
| `GET` | `/api/v1/schedules/:id/versions` | ดูรายการรุ่น |
| `GET` | `/api/v1/schedules/:id/compare/:versionId` | เปรียบเทียบรุ่น |
| `GET` | `/api/v1/schedules/:id/audit-log` | ดู audit trail |
| `POST` | `/api/v1/auth/login` | Login |
| `GET` | `/api/v1/auth/me` | ข้อมูลผู้ใช้ปัจจุบัน |

### 8. Frontend

- แสดงสถานะตาราง (badge: draft / generated / under_review / approved / published)
- ปุ่ม action ตามสถานะ + สิทธิ์:
  - ส่งตรวจ (แสดงสรุป violations ก่อน)
  - อนุมัติ / ส่งกลับ (form เหตุผล)
  - ประกาศ
  - สร้างรุ่นใหม่
- หน้าเปรียบเทียบรุ่น (diff view)
- หน้า audit log
- Login / Logout
- แสดง/ซ่อน actions ตาม role
- ป้องกัน concurrent edit: แจ้งเมื่อ version conflict

## Database Migrations

```
023_create_users
024_create_user_roles
025_create_schedule_audit_log
026_create_schedule_versions
027_add_schedule_status_transitions
```

## การทดสอบ

- State machine: ทุก transition ที่ถูก/ผิด
- สิทธิ์: ทุก role กับทุก action
- สิทธิ์ข้ามหน่วย → ปฏิเสธ
- Hard violation → ส่งตรวจไม่ได้
- Optimistic locking: แก้พร้อมกัน → conflict
- Audit trail: ครบทุกเหตุการณ์, ไม่เก็บ secret
- Idempotency: ส่งซ้ำ → ไม่เปลี่ยนสถานะซ้ำ
- Version comparison: ตรวจ diff ถูกต้อง
- Auth: login, token, unauthorized access → 401/403

## Definition of Done

- [x] State machine บังคับ transition ถูกต้อง
- [x] ทุก action มี authorization ตาม role
- [x] Audit trail ครบทุกเหตุการณ์
- [x] รุ่นตาราง + เปรียบเทียบทำงาน
- [x] Idempotency สำหรับ critical commands
- [x] Login/Auth ทำงาน
- [x] Frontend ครบ workflow actions
- [x] Concurrent edit → conflict detection
- [x] OpenAPI อัปเดต
- [x] Tests ผ่านทุกระดับ
