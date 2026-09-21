# 📋 แผนการพัฒนาระบบจัดตารางเวรและคำนวณค่าตอบแทน NurseFlow (Master Development Plan)

เอกสารแผนพัฒนาฉบับสมบูรณ์ จัดทำโดย **System Analyst & Software Quality Reviewer** เพื่อเป็นแนวทางมาตรฐานในการปรับปรุงและพัฒนาระบบ NurseFlow ให้ถูกต้อง ครบถ้วน ตามหลักการจัดตารางเวรทางการพยาบาลและระเบียบการจ่ายค่าตอบแทนของโรงพยาบาล

---

## 🗺️ แผนผังภาพรวมการพัฒนา (Development Roadmap)

```mermaid
flowchart TD
    subgraph Phase1 [Phase 1: ปรับปรุงตรรกะการคำนวณหลัก (Core Calculation Fix - P1)]
        A1["1.1 คำนวณหน่วยเวร 12 ชม. (D=0.5, N=1.5 หน่วย บด)"]
        A2["1.2 ระบบ Leave Credit Hours (วันลาได้ 8 ชม./วัน ไม่ขาดงาน)"]
        A3["1.3 ระบบคุมเพดานสิทธิเบิกค่าเวร บด (Allowance Cap เช่น 17 วัน)"]
        A4["1.4 แยกประเภทชั่วโมง (Actual Work, Credit, OT, Shortage)"]
    end

    subgraph Phase2 [Phase 2: ระบบควบคุมการปิดงวดและ Audit (Governance & Audit - P2)]
        B1["2.1 เพิ่มสถานะ Closed และ Re-open Approval Workflow"]
        B2["2.2 ระบบ Payroll Override พร้อมบันทึก Audit Trail"]
        B3["2.3 Master Compensation Rate Table เก็บประวัติการปรับเรท"]
    end

    subgraph Phase3 [Phase 3: ความยืดหยุ่นและฟีเจอร์ขั้นสูง (Advanced & Traceability - P3/P4)]
        C1["3.1 คำนวณ Prorate ชั่วโมงสำหรับพนักงานเข้าใหม่กลางเดือน"]
        C2["3.2 ตารางอัตรากำลังตามเกณฑ์ยอดผู้ป่วย (Patient Census Matrix)"]
        C3["3.3 หน้ารายงาน Statement Drill-down ตรวจสอบที่มารายได้รายวัน"]
        C4["3.4 ปรับปรุงการส่งออกเอกสาร Excel (XLSX) ให้ตรงฟอร์มราชการ 100%"]
    end

    Phase1 --> Phase2 --> Phase3
```

---

## 🎯 รายละเอียดแผนงานรายระยะ (Phased Breakdown)

### 🔴 Phase 1: ปรับแก้ตรรกะการคำนวณเงินและชั่วโมง (Core Calculation Fix - Critical P1)
> **เป้าหมาย:** แก้ไขจุดคำนวณที่ทำให้ยอดเงินและชั่วโมงทำงานคลาดเคลื่อนทันที

| ลำดับงาน | รายละเอียดงานและสูตรคำนวณ | ไฟล์ / ตำแหน่งที่เกี่ยวข้อง | ผลลัพธ์ที่ได้ (Deliverables) |
| :---: | :--- | :--- | :--- |
| **1.1** | **คำนวณหน่วยเวร บด สำหรับเวร 12 ชม. (`D`, `N`)**<br>• เวร `D` (08:00–20:00) คร่อมบ่าย 4 ชม. $\rightarrow$ ได้ **0.5 หน่วยบ่าย** ($0.5 \times 240 = 120$ ฿)<br>• เวร `N` (20:00–08:00) คร่อมบ่าย 4 ชม. + ดึก 8 ชม. $\rightarrow$ ได้ **1.5 หน่วย บด** ($1.5 \times 240 = 360$ ฿)<br>• เวร 8 ชม. (`บ`, `ด`) ได้ 1.0 หน่วยตามเดิม | • `backend/internal/service/summary.go`<br>• `frontend/src/components/schedule/NurseStatsColumn.tsx`<br>• `frontend/src/components/schedule/ShiftBadge.tsx` | พยาบาลที่ขึ้นเวร 12 ชม. ได้รับค่าตอบแทนเวรบ่าย-ดึก ครบถ้วน ไม่ตกหล่น |
| **1.2** | **ระบบ Leave Credit Hours**<br>• วันลาพักผ่อน (`Va`, `L`) ที่ได้รับอนุมัติ ให้นับเป็น **8 ชม. Credit/วัน**<br>• $\text{CreditHours} = \text{ActualWorkHours} + \text{LeaveCreditHours}$ | • `backend/internal/service/summary.go`<br>• `backend/internal/validation/engine.go`<br>• `frontend/src/types/schedule.ts` | พยาบาลที่ลาตามสิทธิไม่ถูกคิดเป็นชั่วโมงขาด (Shortage) และคิด OT ได้ถูกต้องเมื่อขึ้นเวรเสริม |
| **1.3** | **ระบบคุมเพดานสิทธิเบิกจ่าย (Allowance Cap)**<br>• กำหนดเพดานสิทธิเบิกประจำเดือน (เช่น `AllowanceCap = 17 วัน`)<br>• $\text{PayableUnits} = \min(\text{CalculatedUnits}, \text{AllowanceCap})$<br>• $\text{ExcessUnits} = \max(0, \text{CalculatedUnits} - \text{AllowanceCap})$ | • `backend/internal/domain/roster.go`<br>• `backend/internal/service/summary.go`<br>• `frontend/src/features/compensation/CompensationModal.tsx` | โรงพยาบาลไม่จ่ายเงินเกินงบประมาณที่ระเบียบกำหนด และแสดงส่วนเกินสิทธิชัดเจน |
| **1.4** | **การแยกประเภทชั่วโมงและชั่วโมงขาด (Hour Segregation)**<br>• $\text{OTHours} = \max(0, \text{CreditHours} - \text{RequiredHours})$<br>• $\text{ShortageHours} = \max(0, \text{RequiredHours} - \text{CreditHours})$<br>• ไม่แสดง OT เป็นตัวเลขติดลบ | • `backend/internal/domain/summary.go`<br>• `frontend/src/components/schedule/NurseStatsColumn.tsx` | แยกตัวเลขชั่วโมงทำงานจริง, ชั่วโมงลา, ชั่วโมง OT และชั่วโมงขาด ชัดเจน |

---

### 🟡 Phase 2: ยกระดับความปลอดภัยและระบบควบคุม (Governance & Audit - P2)
> **เป้าหมาย:** ควบคุมการปิดงวดบัญชี ป้องกันการแก้ไขย้อนหลัง และมีระบบบันทึก Audit Trail

| ลำดับงาน | รายละเอียดงาน | ไฟล์ / ตำแหน่งที่เกี่ยวข้อง | ผลลัพธ์ที่ได้ (Deliverables) |
| :---: | :--- | :--- | :--- |
| **2.1** | **ระบบสถานะ Closed & Re-open Approval Workflow**<br>• เพิ่มสถานะ `closed` ในตาราง `schedules`<br>• เมื่อปิดงวดแล้ว จะล็อกตารางถาวร ห้ามแก้ไขทุกกรณี<br>• หากจำเป็นต้องแก้ไข ต้องส่งคำขอ Re-open พร้อมเหตุผลให้ผู้มีอำนาจอนุมัติ | • `backend/migrations/`<br>• `backend/internal/domain/workflow.go`<br>• `frontend/src/app/page.tsx` | ตารางเวรที่ส่งฝ่ายการเงินไม่สามารถถูกแก้ไขย้อนหลังได้โดยพลการ |
| **2.2** | **ระบบ Payroll Override พร้อมบันทึก Audit Log**<br>• สร้างตาราง `payroll_overrides` เก็บ: `schedule_id`, `nurse_id`, `field_name`, `original_value`, `override_value`, `reason`, `approved_by`, `created_at` | • `backend/migrations/`<br>• `backend/internal/httpapi/roster.go`<br>• `frontend/src/features/compensation/` | ปรับยอดเงินเฉพาะกรณีพิเศษได้อย่างโปร่งใส มีประวัติตรวจสอบย้อนหลัง 100% |
| **2.3** | **Master Compensation Rate Table**<br>• สร้างตาราง Master `compensation_rates` แยกอิสระ<br>• กำหนด `position_id`, `ot_rate`, `eve_night_rate`, `effective_from`, `effective_to` | • `backend/migrations/`<br>• `backend/internal/platform/database/` | รองรับการปรับขึ้นอัตราค่าจ้างตามช่วงเวลา โดยไม่กระทบตารางเวรย้อนหลัง |

---

### 🟢 Phase 3: ฟีเจอร์ขั้นสูงและการแสดงผลสมบูรณ์แบบ (Advanced & UX - P3/P4)
> **เป้าหมาย:** ยกระดับประสบการณ์ผู้ใช้งาน ความยืดหยุ่นตามภาระงาน และรายงานขั้นสูง

| ลำดับงาน | รายละเอียดงาน | ไฟล์ / ตำแหน่งที่เกี่ยวข้อง | ผลลัพธ์ที่ได้ (Deliverables) |
| :--- | :--- | :--- | :--- |
| **3.1** | **Prorate ชั่วโมงมาตรฐานพนักงานเข้าใหม่ / ลาออกกลางเดือน**<br>• คำนวณ `RequiredHours` รายบุคคลตามสัดส่วนวันที่ทำงานจริงในเดือนนั้น | • `backend/internal/service/summary.go`<br>• `backend/internal/domain/nurse.go` | พนักงานเข้าใหม่ไม่ถูกคิดว่าทำงานขาดหลายสิบชั่วโมง |
| **3.2** | **เกณฑ์อัตรากำลังตามยอดผู้ป่วย (Patient Census Matrix)**<br>• สร้าง Rule ใน Policy กำหนดจำนวน RN/PN ที่ต้องการตามช่วงผู้ป่วย ($<6, 7-10, 11-14$ เตียง) และสัดส่วน เช้า 40% / บ่าย 35% / ดึก 25% | • `backend/internal/scheduler/constraint.go`<br>• `frontend/src/features/policy/PolicyModal.tsx` | ตารางเวรสะท้อนภาระงานจริงตามจำนวนผู้ป่วยในหอผู้ป่วยแบบไดนามิก |
| **3.3** | **หน้าจอ Statement Drill-down ตรวจสอบที่มาของรายได้**<br>• พัฒนา Modal คลิกที่ยอดเงินรวมรายคน เพื่อเปิดดูรายการ Statement แจกแจงว่าเงินแต่ละบาทมาจากวันใด กะใด | • `frontend/src/features/dashboard/PayrollDrilldownModal.tsx`<br>• `backend/internal/service/summary.go` | พยาบาลและหัวหน้าวอร์ดสามารถตรวจสอบที่มาของเงินได้อย่างสะดวก รวดเร็ว |
| **3.4** | **ปรับปรุงการ Export Excel (XLSX) ให้ตรงแบบฟอร์มโรงพยาบาล 100%**<br>• จัด Layout Header, ตารางเวร, ตารางสรุปการเงินท้ายแถว, ตารางเกณฑ์อัตรากำลังเตียง, และบล็อก 3 ลายเซ็น (ผู้จัด, ผู้ตรวจ, ผู้อนุมัติ) | • `backend/internal/service/export_xlsx.go`<br>• `frontend/src/components/print/OfficialRosterPrint.tsx` | สามารถพิมพ์หรือส่งออกไฟล์ Excel นำไปใช้งานราชการได้ทันทีโดยไม่ต้องแก้ไขเพิ่ม |

---

## 🧪 เกณฑ์การตรวจรับและทดสอบระบบ (Acceptance Test Matrix)

| กรณีทดสอบ (Test Scenario) | ข้อมูลนำเข้า (Input) | ผลลัพธ์ที่ถูกต้องตามเกณฑ์ (Expected Result) |
| :--- | :--- | :--- |
| **1. ทำงานครบพอดี** | RN ทำงาน 22 เวรเช้า (176 ชม.) ในเดือน 22 วัน | $\text{Work}=176, \text{Credit}=176, \text{OT}=0 \text{ ชม.}, \text{Shortage}=0 \text{ ชม.}$ |
| **2. ทำงานเกินเกิด OT** | RN ทำงาน 25 เวรเช้า (200 ชม.) ในเดือน 22 วัน | $\text{Work}=200, \text{Credit}=200, \text{OT}=24 \text{ ชม.} (3 \text{ เวร}), \text{OT Pay}=2,400 \text{ ฿}$ |
| **3. ทำงานขาด** | RN ทำงาน 20 เวรเช้า (160 ชม.) ในเดือน 22 วัน | $\text{Work}=160, \text{Credit}=160, \text{OT}=0 \text{ ชม.}, \text{Shortage}=16 \text{ ชม.}$ |
| **4. มีวันลาพักผ่อน** | RN ทำงาน 18 เวรเช้า (144 ชม.) + ลาพักผ่อน `Va` 4 วัน (32 ชม.) | $\text{Work}=144, \text{LeaveCredit}=32, \text{Credit}=176, \text{OT}=0, \text{Shortage}=0$ (ทำงานครบสิทธิ) |
| **5. เวร D 12 ชม.** | RN ขึ้นเวร `D` 1 เวร (08:00–20:00) | $\text{Work}=12 \text{ ชม.}, \text{Allowance Unit}=0.5 \text{ หน่วย}, \text{ค่าเวร}=120 \text{ ฿}$ |
| **6. เวร N 12 ชม.** | RN ขึ้นเวร `N` 1 เวร (20:00–08:00) | $\text{Work}=12 \text{ ชม.}, \text{Allowance Unit}=1.5 \text{ หน่วย}, \text{ค่าเวร}=360 \text{ ฿}$ |
| **7. เกินเพดานสิทธิเบิก** | RN ขึ้นเวรบ่าย-ดึก รวม 21.5 หน่วย (เพดาน 17 วัน) | $\text{Calculated}=21.5, \text{Payable}=17.0 \text{ หน่วย } (4,080 \text{ ฿}), \text{Excess}=4.5 \text{ หน่วย}$ |
| **8. พนักงานใหม่เข้ากลางเดือน** | RN เริ่มงาน 16 ก.ย. (ฐานทำงานครึ่งเดือน 11 วัน = 88 ชม.) ทำงาน 96 ชม. | $\text{Required}=88 \text{ ชม.}, \text{Work}=96 \text{ ชม.}, \text{OT}=8 \text{ ชม.}, \text{Shortage}=0$ |

---

## 📈 ตัวชี้วัดความสำเร็จของโครงการ (Success Metrics)
1. **ความถูกต้องทางการเงิน (Payroll Accuracy):** ความถูกต้องของสูตรคำนวณเงินค่าเวร บด และ OT อยู่ที่ 100% ครอบคลุมทั้งเวร 8 ชม., 12 ชม., 16 ชม. และวันลา
2. **ความปลอดภัยและความโปร่งใส (Data Integrity & Compliance):** มีระบบล็อกงวดบัญชี (`Closed`) และมีบันทึก Audit Log ทุกครั้งที่มีการ Override ข้อมูล
3. **ประสิทธิภาพการทำงาน (Operational Efficiency):** ลดระยะเวลาและข้อผิดพลาดในการคำนวณยอดเงินส่งฝ่ายการเงินของหอผู้ป่วยลงมากกว่า 90%
