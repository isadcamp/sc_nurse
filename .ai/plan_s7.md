# Sprint 7 — AI วิเคราะห์, เสนอการสลับเวร และเปรียบเทียบร่าง

สถานะ: เสร็จสมบูรณ์
ที่มา: [plan.md](plan.md) ระยะ 7 | มาตรฐาน: [rule.md](rule.md)
ต้องการ: Sprint 6 เสร็จสมบูรณ์

## เป้าหมาย

เพิ่มบริการ AI ที่ใช้ข้อเท็จจริงจากตัวตรวจสอบและสถิติ เพื่ออธิบายปัญหา เสนอทางแก้ และเปรียบเทียบร่างตาราง โดย AI ไม่มีสิทธิ์เปลี่ยนกฎหรือประกาศตารางเอง

## สิ่งที่ส่งมอบ

### 1. AI วิเคราะห์ (Analysis)

#### สิ่งที่ AI ทำได้

- อธิบายกำลังคนที่ขาด (วันไหน ช่วงไหน ขาดกี่คน)
- ชี้ความเหลื่อมล้ำ (ใครทำงานมากกว่า/น้อยกว่าเป้า)
- วิเคราะห์ภาระกลางคืน/วันหยุดที่ไม่สมดุล
- อธิบายเหตุผลของ violations
- สรุปจุดที่ต้องปรับปรุง

#### แหล่งข้อมูล

- ข้อเท็จจริงจากตัวตรวจสอบ (Validation Engine)
- สถิติจาก Summary Service
- คะแนนความเป็นธรรม (Fairness Score)
- **ไม่ใช้ข้อมูลที่สมมติหรือประมาณเอง**

### 2. AI เสนอการสลับเวร (Swap Suggestions)

#### กระบวนการ

1. AI วิเคราะห์ปัญหาจากตัวตรวจสอบ
2. เสนอการสลับเวร/ปรับร่าง
3. **ข้อเสนอทุกรายการต้องผ่านตัวตรวจสอบ** (Validation Engine เดียวกัน)
4. แสดงผลก่อน–หลังให้หัวหน้าเห็น
5. หัวหน้ายืนยันหรือปฏิเสธ

#### ข้อจำกัดของ AI

- ❌ ไม่มีสิทธิ์เปลี่ยนกฎ
- ❌ ไม่มีสิทธิ์ประกาศตารางเอง
- ❌ ไม่มีสิทธิ์แก้เวรโดยไม่ผ่านการยืนยัน
- ❌ ไม่มีสิทธิ์ลดระดับ hard constraint เป็น soft
- ✅ เสนอเท่านั้น — หัวหน้ายืนยันเสมอ

### 3. AI เปรียบเทียบร่าง (Draft Comparison)

- เปรียบเทียบ 2 ร่างตาราง
- แสดง: จุดที่ต่าง, คะแนนแต่ละด้าน, violations ที่เพิ่ม/ลด
- AI อธิบายข้อดี/ข้อเสียของแต่ละร่าง
- ช่วยตัดสินใจเลือกร่างที่เหมาะสม

### 4. ความเป็นส่วนตัวและความปลอดภัย

- **ส่งรหัสชั่วคราว (anonymized ID)** แทนชื่อจริง
- **ไม่ส่งเหตุผลการลา** ไปยังบริการ AI
- **ผูกผลวิเคราะห์กับรุ่นตาราง** — แสดงว่าล้าสมัยเมื่อข้อมูลเปลี่ยน
- AI เปิด/ปิดผ่าน configuration
- ระบบหลักยังใช้งานได้เมื่อ AI ไม่พร้อม (graceful degradation)
- Log การเรียก AI: ไม่เก็บข้อมูลส่วนบุคคลเกินจำเป็น

### 5. Domain Models ใหม่

```go
type AIAnalysisRequest struct {
    ScheduleID    ScheduleID
    ScheduleVer   int
    AnalysisType  AIAnalysisType  // "overview" | "staffing" | "fairness" | "suggestion"
}

type AIAnalysis struct {
    ID             string
    ScheduleID     ScheduleID
    ScheduleVer    int
    AnalysisType   AIAnalysisType
    Findings       []AIFinding
    Suggestions    []AISwapSuggestion
    IsStale        bool          // ล้าสมัยเมื่อข้อมูลเปลี่ยน
    CreatedAt      time.Time
}

type AISwapSuggestion struct {
    ID             string
    Description    string
    Changes        []ProposedChange    // เวร/คน ที่เปลี่ยน
    BeforeScore    FairnessScore
    AfterScore     FairnessScore
    Violations     ValidationResult    // ผลตรวจจาก validator
    Status         SuggestionStatus    // proposed | accepted | rejected
}

type AIDraftComparison struct {
    DraftA         ScheduleRef
    DraftB         ScheduleRef
    Differences    []AssignmentDiff
    ScoreA         FairnessScore
    ScoreB         FairnessScore
    AIExplanation  string
}
```

### 6. AI Service Architecture

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Frontend   │────▶│  Application     │────▶│  AI Service  │
│             │     │  Service          │     │  (optional)  │
│             │     │                  │     └─────────────┘
│             │     │  ┌────────────┐  │
│             │     │  │ Validator  │  │  ← ข้อเสนอ AI ต้องผ่าน
│             │     │  │ Engine     │  │
│             │     │  └────────────┘  │
│             │     │  ┌────────────┐  │
│             │     │  │ Summary    │  │  ← ข้อมูลที่ส่งให้ AI
│             │     │  │ Service    │  │
│             │     │  └────────────┘  │
└─────────────┘     └──────────────────┘
```

- AI Service เปิดผ่าน configuration (feature flag)
- Application Service เป็นผู้ anonymize ข้อมูลก่อนส่ง
- ข้อเสนอกลับมาต้อง de-anonymize + validate ก่อนแสดง
- ถ้า AI service ล้ม → แจ้งผู้ใช้ ระบบหลักทำงานต่อ

### 7. API Endpoints ใหม่

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/schedules/:id/ai/analyze` | ขอ AI วิเคราะห์ |
| `GET` | `/api/v1/schedules/:id/ai/analysis` | ดูผลวิเคราะห์ |
| `POST` | `/api/v1/schedules/:id/ai/suggest-swaps` | ขอ AI เสนอสลับเวร |
| `GET` | `/api/v1/schedules/:id/ai/suggestions` | ดูข้อเสนอ |
| `POST` | `/api/v1/ai/suggestions/:id/accept` | ยืนยันข้อเสนอ |
| `POST` | `/api/v1/ai/suggestions/:id/reject` | ปฏิเสธข้อเสนอ |
| `POST` | `/api/v1/schedules/compare` | เปรียบเทียบ 2 ร่าง + AI อธิบาย |
| `GET` | `/api/v1/ai/status` | สถานะ AI service |

### 8. Frontend

#### หน้า AI วิเคราะห์

- ปุ่มขอวิเคราะห์ (แสดง loading)
- ผลวิเคราะห์: finding cards แยกหมวด (กำลังคน, ความเป็นธรรม, violations)
- แสดง "ล้าสมัย" เมื่อตารางเปลี่ยน + ปุ่มวิเคราะห์ใหม่

#### หน้าข้อเสนอสลับเวร

- รายการข้อเสนอ พร้อมคำอธิบาย
- แต่ละรายการ: ก่อน/หลัง side-by-side
- คะแนนก่อน/หลัง
- Violations ที่เพิ่ม/ลด
- ปุ่ม ยืนยัน / ปฏิเสธ ต่อรายการ

#### หน้าเปรียบเทียบร่าง

- เลือก 2 ร่าง → แสดง diff
- AI อธิบายข้อดี/ข้อเสีย
- คะแนนเทียบกัน

#### Graceful Degradation

- AI service ล้ม → แสดงข้อความ "AI ไม่พร้อมใช้งาน"
- ซ่อนปุ่ม AI หรือ disable
- ระบบจัดตาราง, แก้, อนุมัติ ทำงานปกติ

## Database Migrations

```
028_create_ai_analyses
029_create_ai_suggestions
030_create_ai_draft_comparisons
```

## การทดสอบ

### AI Service

- AI วิเคราะห์ส่งข้อมูลที่ถูกต้อง (anonymized)
- ข้อเสนอผ่าน validator ก่อนแสดง
- ข้อเสนอที่ผิดกฎ → ปฏิเสธโดยระบบ ไม่แสดงให้ผู้ใช้
- Accept suggestion → แก้เวรจริง + ผ่าน validation
- ผลวิเคราะห์ล้าสมัยเมื่อข้อมูลเปลี่ยน

### Graceful Degradation

- AI service ล้มเหลว → ระบบหลักทำงานปกติ
- AI service ช้า → timeout + แจ้งผู้ใช้
- AI service กลับมา → ใช้ได้อีกครั้ง

### Privacy

- ไม่ส่งชื่อจริงไปยัง AI
- ไม่ส่งเหตุผลการลา
- Log ไม่เก็บข้อมูลส่วนบุคคลเกินจำเป็น

### Integration

- End-to-end: วิเคราะห์ → เสนอ → ยืนยัน → ตรวจตาราง
- เปรียบเทียบร่าง: ตัวเลขตรงกับ Summary Service

## E2E ครบวงจร (ทดสอบทั้งระบบ)

ตาม plan.md:
```
ตั้งค่า → ขอ/อนุมัติลา → จัดเดือน → แก้และตรวจ → อนุมัติ → ประกาศ → Export
```

## Definition of Done

- [x] AI วิเคราะห์ตารางได้ พร้อมแสดงผล
- [x] AI เสนอสลับเวร → ผ่าน validator → หัวหน้ายืนยัน
- [x] AI เปรียบเทียบ 2 ร่างได้
- [x] Privacy: anonymize + ไม่ส่งเหตุผลลา
- [x] Graceful degradation เมื่อ AI ล้ม
- [x] ผลวิเคราะห์ล้าสมัยแสดงชัดเจน
- [x] OpenAPI อัปเดต
- [x] E2E ครบวงจรผ่าน
- [x] Tests ผ่านทุกระดับ
- [x] ระบบพร้อมใช้งานจริง
