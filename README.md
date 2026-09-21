# Nurse Scheduler

Monorepo สำหรับระบบจัดตารางเวรพยาบาลอัตโนมัติ

ตำแหน่งโครงการ: `C:\xampp\htdocs\nurse` ใช้ Node.js และ Go รันแยกจาก Apache/XAMPP
ระบบมี Go REST API, MySQL persistence, bearer authentication, การจัดการหน่วยงาน/บุคลากร/วันลา/วันหยุด, การตรวจข้อบังคับ, การแก้ไขและล็อกเวร, workflow ส่งตรวจ/อนุมัติ/ประกาศ และตัวจัดเวร AUTO แบบผลลัพธ์ข้อเสนอ ทั้งนี้ยังต้องตั้งค่า credentials และ policy ของหน่วยงานก่อนใช้งานจริง

## โครงสร้าง

- `frontend` — Next.js App Router + TypeScript
- `backend` — Go REST API แยก domain, service, handler และ middleware
- `tests/e2e` — Playwright end-to-end tests
- `docs/openapi.yaml` — API contract
- `tests/api/requests.http` — ตัวอย่างทดสอบ API สำหรับ REST Client
- `templates/feature.md` — template สำหรับเพิ่มโมดูลและ acceptance criteria

## เริ่มใช้งาน

เปิด terminal 2 หน้าต่าง:

```powershell
cd backend
go run ./cmd/api
```

```powershell
cd frontend
npm run dev
```

Frontend: http://localhost:3000  
API: http://localhost:8080/api/v1  
Health: http://localhost:8080/health
ก่อนเปิดใช้งานต้องกำหนด environment variables ของ backend:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `ROSTER_CREDENTIALS` เป็น JSON array ของผู้ใช้ที่มี `token`, `id`, `role` (`head` หรือ `viewer`) และ `wards`
- `FRONTEND_ORIGIN` ให้ตรงกับ URL frontend

Frontend ต้องตั้ง `NEXT_PUBLIC_API_URL` ให้ชี้ไปที่ `/api/v1` ของ backend และผู้ใช้ต้องกรอกรหัสเข้าใช้งานในหน้า Login ระบบไม่ฝัง token เริ่มต้นไว้ในโค้ด

ลำดับใช้งานสำหรับหัวหน้าหอผู้ป่วย: เข้าสู่ระบบ → เลือกหน่วยงาน/เดือน → สร้างหรือเปิดตาราง → ตรวจและแก้ข้อผิดพลาด → ส่งตรวจ → อนุมัติ → ประกาศ/พิมพ์

## ทดสอบ

```powershell
cd backend
go test ./...

cd ..\tests\e2e
npm test
```

E2E ใช้พอร์ต 3100/8180 และเปิด/ปิดบริการให้อัตโนมัติ ต้องไม่มีบริการอื่นใช้สองพอร์ตนี้
Chromium ติดตั้งใน `tests/e2e/browsers` แล้ว หากติดตั้งใหม่ให้รัน `npm run install:browsers` ที่โฟลเดอร์ E2E
เมื่อติดตั้งจาก source ใหม่ รัน `npm ci` ที่ `frontend` และ `tests/e2e` ก่อน
`frontend/.env.example` ให้คัดลอกเป็น `.env.local` หากต้องเปลี่ยน API URL
Go อ่าน environment variables ของ shell โดยตรง ไม่โหลด `.env` อัตโนมัติ

ตรวจ frontend: `npm run lint` และ `npm run build` ภายใน frontend
ตรวจ backend: `go test ./...` และ `go vet ./...` ภายใน backend

## กฎของตัวอย่าง AUTO

- พยาบาลไม่ลงซ้ำในวันเดียวกัน
- เลือกหัวหน้าเวรเป็นคนแรกและเติมคนตามภาระงานสะสม
- ไม่ลงเช้าหลังดึกของวันก่อนหน้าในช่วงที่สร้าง
- แจ้งเตือนหากเติมกำลังคนไม่ได้ ไม่รับประกันว่าจะค้นพบตารางที่เป็นไปได้ทั้งหมด
- ยังไม่ตรวจรอยต่อเดือน ชั่วโมงพักจริง ชั่วโมงสูงสุด หรือวันทำงานต่อเนื่อง

## ลำดับพัฒนาต่อ

1. ยืนยันกฎเวรและ acceptance criteria กับหน่วยงาน
2. เพิ่มฐานข้อมูลและ repository พร้อม migration
3. เพิ่มพยาบาล วันลา ทักษะ และการตั้งค่ากฎ
4. เพิ่ม solver/validation, unit tests กฎจริง และ approval workflow

