# Sprint 4 — AUTO Solver, ตรวจความพร้อม และคะแนนความเป็นธรรม

สถานะ: ยังไม่เริ่ม
ที่มา: [plan.md](plan.md) ระยะ 4 | มาตรฐาน: [rule.md](rule.md)
ต้องการ: Sprint 3 เสร็จสมบูรณ์

## เป้าหมาย

แทนที่ greedy scheduler ด้วย constraint solver ที่ทำงานผ่าน interface, ตรวจความพร้อมก่อนจัด, ทำงานเป็น background job, ให้คะแนนความเป็นธรรม และรองรับการจัดใหม่เฉพาะส่วนที่ไม่ล็อก

## สิ่งที่ส่งมอบ

### 1. ตรวจความพร้อมก่อน AUTO (Readiness Check)

#### Checklist

- ✅ ชุดตั้งค่าที่ยืนยัน (`confirmed`) สำหรับเดือนเป้าหมาย
- ✅ บุคลากร/ทักษะเพียงพอ
- ✅ เป้าหมายรายคนครบ
- ✅ อัตรากำลังกำหนดแล้ว
- ✅ วันลาที่อนุมัติบันทึกแล้ว
- ✅ เวรล็อกไม่ขัดกับกฎ
- ✅ ประวัติรอยต่อเดือนเพียงพอต่อกฎที่เปิดใช้

#### เมื่อไม่ผ่าน Checklist

- หยุดก่อนส่ง solver
- ระบุ: รหัสปัญหา, field, วันที่, บุคลากรที่เกี่ยวข้อง, ทางไปแก้ค่า
- ตัวอย่าง:
  - OFF ขั้นต่ำ > เป้าหมาย
  - ชั่วโมงเป้าหมาย > เพดาน
  - จำนวนหัวหน้า > คนที่มีสิทธิ์
  - เวรล็อกทับลา
  - เปิด ชบ 16h แต่เพดานต่อเนื่อง 12h → ระบุว่า ชบ ใช้ไม่ได้ ตัดออก
  - ถ้ามี ชบ ที่ล็อก + ใช้ไม่ได้ → หยุดและรายงาน

#### หลักการสำคัญ

- ผ่าน checklist ≠ รับประกันจัดสำเร็จ
- ห้ามเปลี่ยนข้อบังคับเพื่อให้ solver ผ่าน
- การจำลองใช้ร่างที่มีค่าครบได้ แต่ห้ามนำผลไปใช้จริงจนยืนยันชุดตั้งค่า

### 2. Policy Snapshot

- ทุกงาน AUTO เก็บ snapshot:
  - ชุดกฎที่ resolve แล้ว
  - เป้าหมายรายคน
  - แบบเวรที่ใช้
  - อัตรากำลัง
  - วันลา
  - ภารกิจอื่น
  - เวรล็อก
- พร้อม version/hash เพื่อทำซ้ำและอธิบายผลได้
- หากหลายช่วงนโยบายในเดือน → resolve ตามวันที่มีผล
- หากขาด/ซ้อนกัน → บล็อก + ระบุช่วงวันที่ต้องแก้

### 3. Constraint Solver

#### Architecture

```go
// Solver interface แยกจาก application service
type Solver interface {
    Solve(ctx context.Context, input SolverInput) (SolverOutput, error)
}

type SolverInput struct {
    Snapshot     ResolvedPolicySnapshot
    Month        YearMonth
    LockedShifts []LockedAssignment
    BoundaryData BoundaryData
    Seed         int64
    MaxDuration  time.Duration
    Scope        SolveScope  // ทั้งเดือน หรือเฉพาะส่วนที่ไม่ล็อก
}

type SolverOutput struct {
    Status       SolveStatus  // complete | partial | infeasible | timeout
    Assignments  []Assignment
    Violations   []RuleViolation
    Diagnostics  SolveDiagnostics
    Score        FairnessScore
}
```

#### ข้อกำหนด

- เคารพ: วันลา, OFF ที่ล็อก, ทักษะ, ชั่วโมงสูงสุด, วันต่อเนื่อง, เวลาพัก
- ใช้เวรควบตามสิทธิ์และเพดาน
- จัดกำลังคนครบตามช่วงเวลา
- กระจายชั่วโมง, ภาระกลางคืน, งานวันหยุดตามเป้าหมาย
- ตอบสนองความต้องการรายคน
- ลดการเปลี่ยนเวรเดิมเมื่อจัดใหม่
- ผลทำซ้ำได้เมื่อ input + config + seed เหมือนกัน
- ใช้ snapshot ไม่อ่าน DB ทีละรายการระหว่างคำนวณ
- ไม่เขียนทับตารางที่ถูกแก้ระหว่างรอผล

#### ผลลัพธ์

| Status | ความหมาย |
|--------|----------|
| `complete` | จัดครบ ผ่านทุก hard constraint |
| `partial` | จัดได้บางส่วน มี understaffing — ประกาศไม่ได้ |
| `infeasible` | พิสูจน์ว่าไม่มีคำตอบ |
| `timeout` | หมดเวลา ≠ พิสูจน์ว่าไม่มีคำตอบ |

- ร่างที่ขาดกำลังคนหรือผิดกฎบังคับ → ประกาศไม่ได้
- Validate ผลลัพธ์ทั้งหมดอีกครั้งก่อนบันทึก

### 4. Background Job

- API เริ่ม AUTO รับ: หน่วยงาน, เดือน, ปี, เวอร์ชันนโยบาย, รุ่นตาราง, ขอบเขตจัดใหม่
- Backend โหลดและตรวจค่าเอง — ไม่เชื่อค่ากฎที่ client ส่งมา
- งานเบื้องหลังพร้อมสถานะ (pending → running → completed/failed)
- ยกเลิกได้
- จำกัดเวลาคำนวณสูงสุดฝั่ง server
- หากข้อมูลหรือกฎเปลี่ยนระหว่างคำนวณ → ทำเครื่องหมาย "ล้าสมัย" + ตรวจใหม่ก่อนใช้
- ห้ามเขียนทับตารางใหม่โดยอัตโนมัติ

### 5. คะแนนความเป็นธรรม (Fairness Score)

แยก objective score:
- **Coverage** — กำลังคนครบตามช่วงเวลา
- **Fairness** — การกระจายชั่วโมง, ภาระกลางคืน, วันหยุด
- **Preference** — ตอบสนองความต้องการรายคน
- **Stability** — ลดการเปลี่ยนเวรเดิม

น้ำหนักแต่ละด้านมาจาก policy settings (กลุ่ม "ความเป็นธรรม")

### 6. การจัดใหม่เฉพาะส่วน (Partial Re-generation)

- เลือกจัดใหม่เฉพาะ: ช่วงวันที่ / บุคลากรบางคน / เวรที่ไม่ล็อก
- เวรล็อกคงเดิมเสมอ
- ตรวจกฎกับส่วนที่คงอยู่ด้วย

### 7. การจำลอง (Simulation)

- จำลองจากชุดตั้งค่า (ร่างที่มีค่าครบ) กับข้อมูลเดือนเป้าหมาย
- ไม่แก้ตารางจริงหรือประกาศผล
- แสดงข้อผิดพลาด/คะแนนก่อน–หลัง
- ผลจำลองแยกจากผลจริง

### 8. API Endpoints ใหม่

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/schedules/:id/readiness-check` | ตรวจความพร้อม |
| `POST` | `/api/v1/schedules/:id/generate` | เริ่ม AUTO (background job) |
| `GET` | `/api/v1/jobs/:jobId` | สถานะ job |
| `DELETE` | `/api/v1/jobs/:jobId` | ยกเลิก job |
| `GET` | `/api/v1/schedules/:id/score` | คะแนนความเป็นธรรม |
| `POST` | `/api/v1/schedules/:id/simulate` | จำลอง |
| `GET` | `/api/v1/schedules/:id/snapshot` | ดู policy snapshot |

### 9. Domain Models ใหม่

- `ResolvedPolicySnapshot` — snapshot + version/hash
- `ReadinessReport` — checklist + ปัญหาที่พบ
- `SolverJob` — status, progress, result reference
- `FairnessScore` — คะแนนแยกด้าน

### 10. Frontend

- หน้าเริ่มจัด AUTO + checklist ความพร้อม
- แสดงสถานะ job (pending → running → completed/failed)
- ปุ่มยกเลิก job
- แสดงผลลัพธ์: ตาราง + violations + คะแนน
- เลือกขอบเขตจัดใหม่ (ทั้งเดือน / บางส่วน)
- หน้าจำลอง: เลือกชุดตั้งค่า → ดูผลก่อน–หลัง
- แสดงว่าผลล้าสมัยเมื่อข้อมูลเปลี่ยน

## Database Migrations

```
020_create_solver_jobs
021_create_policy_snapshots
022_create_schedule_scores
```

## การทดสอบ

- Readiness check: ข้อมูลครบ → ผ่าน, ขาด → ระบุปัญหา
- กฎขัดกัน: OFF ขั้นต่ำ > เป้าหมาย, ชบ > เพดานชั่วโมง
- Solver: complete, partial, infeasible, timeout
- เวรล็อก → ไม่ถูกเปลี่ยน
- Snapshot คงเดิมเมื่อแก้ค่าใหม่
- จำลองไม่แก้ตารางจริง
- ผลเก่าต้องตรวจใหม่เมื่อข้อมูลเปลี่ยน
- ค่ารายคน/หน่วยผ่อนกฎกลางไม่ได้
- น้ำหนักคะแนนไม่ทำให้ละเมิดข้อบังคับ
- ชั่วโมงข้ามเดือน, ช่วงเลื่อน 24h/7 วัน
- Acceptance: สร้างค่าหน่วยงาน 2 ชุดต่างกัน → AUTO ได้ตามค่าแต่ละชุด โดยไม่แก้ source code
- ผลซ้ำได้เมื่อ input + config + seed เหมือนกัน

## Definition of Done

- [ ] Readiness check ครบ checklist + ระบุปัญหา
- [ ] Constraint solver ผ่าน interface ทำงานได้
- [ ] Background job: เริ่ม/ดูสถานะ/ยกเลิก
- [ ] Policy snapshot เก็บ + ทำซ้ำได้
- [ ] Fairness score แยก 4 ด้าน
- [ ] Partial re-generation ทำงาน
- [ ] Simulation ไม่แก้ตารางจริง
- [ ] ลบ greedy scheduler เดิม (หรือคงไว้เป็น fallback)
- [ ] OpenAPI อัปเดต
- [ ] Tests ผ่านทุกระดับ
