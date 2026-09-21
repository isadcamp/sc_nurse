# Sprint 10 — ระบบยืนยันตัวตนและการจัดการสิทธิ์ตามบทบาท (Auth, Role-Based Access Control & User UI)

สถานะ: ยังไม่เริ่ม
ที่มา: [plan.md](plan.md) ระยะ 10 | มาตรฐาน: [rule.md](rule.md)
ต้องการ: Sprint 9 เสร็จสมบูรณ์

## เป้าหมาย

พัฒนาระบบผู้ใช้งาน การเข้าสู่ระบบ (Authentication) และการควบคุมสิทธิ์ตามบทบาท (Role-Based Access Control: RBAC) พร้อม UI สลับบทบาทและจำกัดสิทธิ์บนหน้าเว็บ เพื่อให้การทดสอบและการใช้งานจริงในองค์กรเป็นไปตามมาตรการความปลอดภัยและสอดคล้องกับ Workflow การอนุมัติตารางเวร

## สิ่งที่ส่งมอบ

### 1. บทบาทและสิทธิ์ผู้ใช้งาน (Roles & Permissions)

| บทบาท (Role) | สิทธิ์และหน้าที่ในระบบ |
|---|---|
| **Admin (ผู้ดูแลระบบ)** | จัดการหน่วยงาน (Ward), กำหนดกรอบนโยบายกลาง, จัดการผู้ใช้งานทั้งหมด |
| **Head Nurse (หัวหน้าหน่วยงาน)** | จัดการพยาบาลในหน่วยงาน, จัดตารางเวร, แก้ไขเวร, ล็อกเวร, รัน AUTO Solver, ขอ AI สลับเวร, ส่งตรวจ (Submit for Review) |
| **Approver (ผู้อนุมัติตาราง)** | ตรวจสอบตารางและ violations, กดอนุมัติ (Approve), หรือส่งกลับแก้ไข (Revise) |
| **Nurse (พยาบาลทั่วไป)** | ดูตารางเวรของตนเองและเพื่อนร่วมงาน (โหมด Read-Only), ยื่นคำขอลา |

- ป้องกันการเข้าถึงข้ามหน่วยงาน (Cross-ward permission enforcement) ตรวจสอบทุก API call

### 2. ระบบยืนยันตัวตนและการจัดการผู้ใช้งาน (User & Auth Management)

- ตารางผู้ใช้งาน `users` และบทบาท `user_roles`
- บันทึกรหัสผ่านด้วย Secure Hash (เช่น bcrypt / argon2)
- ระบบออกและตรวจสอบ Token (Bearer Token / JWT)
- บันทึกชื่อและรหัสผู้ใช้งานจริงลงใน Audit Trail (`schedule_audit`) ในทุกการกระทำ

### 3. หน้าจอและประสบการณ์ผู้ใช้ (Frontend UI)

- **หน้าเข้าสู่ระบบ (Login View)**:
  - ฟอร์มเข้าสู่ระบบด้วย Username/Password
  - ตัวสลับบทบาทจำลอง (Dev Role Switcher) สำหรับการทดสอบ Workflow ได้สะดวก
- **การจำกัดสิทธิ์ในหน้าจอ (Role-Based UI Rendering)**:
  - พยาบาลทั่วไป (`nurse`): ซ่อนปุ่มแก้ไขเซลล์, ซ่อนปุ่ม AUTO, ซ่อนปุ่มส่งตรวจ/อนุมัติ
  - หัวหน้าหน่วย (`head`): แสดงปุ่มจัดเวร, แก้มือ, AUTO, ส่งตรวจ แต่ซ่อนปุ่มอนุมัติ
  - ผู้อนุมัติ (`approver`): แสดงปุ่มอนุมัติและปุ่มส่งกลับแก้ไข (พร้อมแบบฟอร์มระบุเหตุผล)
- **แถบแสดงสถานะผู้ใช้ (User Profile Bar)**:
  - แสดงชื่อผู้ใช้, บทบาทปัจจุบัน, หน่วยงานที่สังกัด และปุ่มออกจากระบบ (Logout)

### 4. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/login` | เข้าสู่ระบบ (คืน Token + ข้อมูลผู้ใช้และสิทธิ์) |
| `GET` | `/api/v1/auth/me` | ดึงข้อมูลผู้ใช้งานปัจจุบันและสิทธิ์ |
| `POST` | `/api/v1/auth/logout` | ออกจากระบบ |
| `GET` | `/api/v1/users` | รายชื่อผู้ใช้งานในระบบ (Admin only) |
| `POST` | `/api/v1/users` | เพิ่มผู้ใช้งานใหม่ (Admin only) |
| `PUT` | `/api/v1/users/:id` | แก้ไขข้อมูลผู้ใช้และบทบาท (Admin only) |

## Database Migrations

```
027_create_users_and_roles
028_seed_default_users
```

## การทดสอบ

1. **Auth & Role Security Tests**:
   - ทดสอบ Login สำเร็จ / รหัสผ่านผิด
   - ทดสอบการเข้าถึง Endpoint โดยไม่มี Token (401 Unauthorized)
   - ทดสอบการกระทำที่ไม่มีสิทธิ์ตามบทบาท (403 Forbidden)
   - ทดสอบการเข้าถึงข้อมูลข้าม Ward ที่ไม่ได้รับอนุญาต
2. **Workflow with Roles**:
   - `head` จัดตาราง → ส่งตรวจ (`under_review`)
   - `approver` เข้ามาตรวจ → กดอนุมัติ (`approved`) หรือส่งกลับ (`generated`)
   - `nurse` เข้ามาดูตารางได้อย่างเดียว

## Definition of Done

- [ ] ระบบ Authentication (Login, Me, Logout) ทำงานสมบูรณ์
- [ ] Role Middleware บังคับใช้สิทธิ์ (Admin, Head, Approver, Nurse) ทุก endpoint
- [ ] Audit Trail บันทึก Actor จริงของผู้ใช้ทุกครั้ง
- [ ] Frontend: หน้า Login และ Role Switcher ใช้งานได้
- [ ] Frontend: ซ่อน/แสดงปุ่มและฟังก์ชันตามบทบาทของผู้ใช้จริง
- [ ] ป้องกันการแก้ไขข้ามหน่วยงานได้อย่างปลอดภัย
- [ ] Tests ผ่านทุกระดับ
