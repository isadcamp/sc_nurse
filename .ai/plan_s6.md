# Sprint 6 — Dashboard และ Excel Export

สถานะ: เสร็จสมบูรณ์
ที่มา: [plan.md](plan.md) ระยะ 6 | มาตรฐาน: [rule.md](rule.md)
ต้องการ: Sprint 5 เสร็จสมบูรณ์

## เป้าหมาย

สร้าง Dashboard แสดงสถิติครบถ้วน และ Excel export ที่ใช้บริการสรุปเดียวกัน เพื่อให้ตัวเลขตรงกันทุกจุด

## สิ่งที่ส่งมอบ

### 1. Shared Summary Service

**หลักการ**: Dashboard และ Excel ใช้บริการสรุปชุดเดียวกัน ไม่คำนวณแยก

บริการนี้ผลิต:

```go
type ScheduleSummary struct {
    WardInfo          WardInfo
    Month             YearMonth
    ScheduleVersion   int
    ScheduleStatus    ScheduleStatus
    GeneratedAt       time.Time

    // รายคน
    NurseStats        []NurseMonthStat
    // รายวัน/ช่วงเวลา
    DailyStaffing     []DailyStaffingStat
    // สรุปรวม
    Totals            ScheduleTotals
    // violations ที่ยังไม่แก้
    Violations        []RuleViolation
}
```

### 2. Dashboard — ตารางรายเดือน

#### มุมมองตาราง
- แถว = บุคลากร, คอลัมน์ = วันที่
- สี + คำอธิบายชนิดเวร
- สีวันหยุดบนหัวคอลัมน์
- เครื่องหมายล็อก 🔒
- กรอง: หน่วยงาน, เดือน, ปี, สถานะตาราง

#### สถิติ

| หมวด | รายละเอียด |
|------|-----------|
| ภาพรวม | จำนวนบุคลากรใช้งาน, จำนวนรายการเวร, ชั่วโมงตามแผน |
| รายคน | ชั่วโมง, เป้าหมาย, OFF, วันลา, เวรควบ, ภาระกลางคืน |
| กำลังคน | จำนวนคนจริง vs ขั้นต่ำ ในแต่ละวัน/ช่วงเวลา + จำนวนที่ขาด |
| การกระจาย | กระจายภาระ (fairness score breakdown) |
| ปัญหา | จำนวนข้อผิดพลาด/คำเตือนที่ยังไม่แก้ |

#### การนับที่ต้องแม่นยำ

- แยก "จำนวนรายการเวร" vs "จำนวนช่วงเวร":
  - ชบ = 1 รายการ แต่ให้กำลังคนช่วงเช้า + บ่าย
- แสดงจำนวนคนแยก 4 ช่วงเวลา (00–08, 08–16, 16–20, 20–24):
  - Day/Night ไม่ถูกนับเป็นคนเต็มเวรที่ไม่ได้ทำงานครบช่วง
- ชั่วโมงข้ามเดือน: แสดงยกมา/ล้ำแยก

### 3. Excel Export `.xlsx`

Export จากรุ่นตารางที่เลือก:

#### แผ่นที่ 1 — ตารางเวร

- หัว: ชื่อหน่วยงาน, เดือน, ปี พ.ศ., รุ่นตาราง, สถานะ, เวลา Export
- แถว = บุคลากร, คอลัมน์ = วันที่
- วันย่อภาษาไทย
- สีเวรตามหน้าจอ
- หัวคอลัมน์วันหยุดพิเศษ: สีม่วง + ★
- สรุปเวรทุกชนิด, ชั่วโมง, X, L รายคน (คอลัมน์ท้ายแถว)
- จำนวนคนจริงท้ายตาราง แยกตามช่วงเวลา
- Freeze panes (ล็อกชื่อ + หัวคอลัมน์)
- การตั้งค่าพิมพ์ให้อ่านได้

#### แผ่นที่ 2 — สรุปภาระงาน

- ชั่วโมงรายคน, เป้าหมาย, ส่วนต่าง
- OFF, วันลา, เวรควบ
- ภาระกลางคืน
- การกระจายภาระ

#### แผ่นที่ 3 — ข้อผิดพลาด/คำเตือน

- รายการ violations ทั้งหมด
- รหัสกฎ, ระดับ (error/warning), วันที่, เวร, บุคลากร, คำอธิบาย

#### ข้อกำหนด

- ร่างที่ Export → ระบุว่าเป็นร่างชัดเจน (watermark/header)
- รายงานแสดงชั่วโมงตามแผน — ไม่อ้างว่าเป็นเวลาปฏิบัติงานจริงหรือรายงานเงินเดือน
- **ตัวเลขทั้งหมดตรงกับ Dashboard**

### 4. API Endpoints ใหม่

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/schedules/:id/summary` | สรุปสถิติ (shared service) |
| `GET` | `/api/v1/schedules/:id/daily-staffing` | กำลังคนรายวัน/ช่วงเวลา |
| `GET` | `/api/v1/schedules/:id/nurse-stats` | สถิติรายคน |
| `GET` | `/api/v1/schedules/:id/export/xlsx` | Export Excel |

### 5. Frontend

- Dashboard page:
  - สรุปตัวเลขด้านบน (cards)
  - ตารางกำลังคนรายวัน (heat map หรือ table)
  - สถิติรายคน (sortable table)
  - Violations panel
  - กรอง: หน่วยงาน, เดือน, ปี, สถานะ
- ปุ่ม Export Excel (เลือกรุ่นตาราง)
- แสดงว่า export เป็นร่าง/ประกาศ
- Responsive: ตาราง scroll ได้บนจอเล็ก, caption + header scope

## การทดสอบ

### ความถูกต้องของตัวเลข

- **ทุกยอดใน Dashboard กับ Excel ตรงกัน** รวม:
  - เวรควบ (ชบ/ดบ — นับรายการ vs ช่วง)
  - เวรข้ามเดือน
  - ชั่วโมงยกมา/ล้ำ
  - Day/Night ที่ไม่ครบช่วง
- จำนวนคน 4 ช่วงเวลาถูกต้อง
- สรุปรายคน: ชั่วโมง, OFF, ลา, เวรควบ, กลางคืน

### Excel

- เปิดได้ใน Excel/LibreOffice
- สีถูกต้อง
- Freeze panes ทำงาน
- วันหยุดพิเศษมี ★ + สีม่วง
- ร่างระบุ "ร่าง" ชัดเจน
- เนื้อหาภาษาไทยถูกต้อง

### อื่นๆ

- Summary service: ทดสอบกับหลายเดือน (28–31 วัน)
- API tests: success + error + permissions
- Frontend: loading, empty, error states
- `go test ./...`, `go vet ./...`, frontend lint + build

## Definition of Done

- [x] Summary service ผลิตตัวเลขถูกต้อง
- [x] Dashboard แสดงสถิติครบ
- [x] Excel export ครบ 3 แผ่น + formatting
- [x] ตัวเลข Dashboard = Excel
- [x] เวรควบ + เวรข้ามเดือนนับถูก
- [x] ร่าง export ระบุชัดเจน
- [x] OpenAPI อัปเดต
- [x] Tests ผ่านทุกระดับ
