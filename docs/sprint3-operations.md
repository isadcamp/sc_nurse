# Sprint 3 — การใช้งานและการตั้งค่า

## สิ่งที่พัฒนา
ตารางรายเดือน 28–31 วัน, แก้เวรและตรวจผลกระทบ, ล็อก/ปลดล็อก, optimistic version, audit ใน transaction เดียวกัน, validation 18 กฎ และข้อมูลรอยต่อเดือนจาก MySQL

API หลัก 10 รายการตามแผนอยู่ใน `docs/openapi.yaml` (เขียนเป็น JSON ซึ่งเป็น YAML ที่ถูกต้องด้วย) เพิ่ม `PUT /api/v1/wards/{ward}/roster-policy` สำหรับกำหนดค่ากฎที่ Sprint 3 ต้องใช้

## เปิดระบบจริงในเครื่องพัฒนา
1. ให้มีข้อมูลหน่วยงาน/บุคลากร/เวรของหน่วยใน MySQL ก่อน การพัฒนารอบนี้ไม่เพิ่มข้อมูลสมมติในฐาน `nurse`
2. กำหนด `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=nurse`; connection ใช้ utf8mb4 และ UTC
3. กำหนด `ROSTER_CREDENTIALS` เป็น JSON array ของ `{token,id,role,wards}`
   - token ต้องสุ่มอย่างน้อย 24 ตัวอักษร และไม่บันทึกลง Git
   - role เป็น `head` หรือ `viewer`; wards เป็นรายการรหัสหน่วยที่เข้าถึงได้
   - head สร้าง/แก้/ล็อก/override ได้; viewer อ่านได้
   - เป็น server-provisioned bearer authentication สำหรับรุ่นนี้ ยังไม่ได้เชื่อม SSO โรงพยาบาล
4. รัน `go run ./cmd/api` จาก `backend`; `MIGRATIONS_DIR` ค่าเริ่มต้นคือ `migrations`
5. ส่ง policy ที่หน่วยงานอนุมัติไปยัง `PUT /api/v1/wards/{ward}/roster-policy` พร้อม Bearer token; ต้องระบุทุกฟิลด์ตาม OpenAPI ไม่มีค่า clinical policy ถูกสมมติให้
6. `shift_types.periods` เป็น JSON array `[{start,end}]` หน่วยนาทีจากเที่ยงคืนวันในตาราง เช่น ช = 480–960, บ = 960–1440, ด = 0–480, ชบ = 480–1440, ดบ = 0–480 และ 960–1440, Night = 1200–1920 ส่วน X/L เป็น array ว่าง ข้อมูลเวรทำงานที่ไม่มีช่วงเวลาจะถูกปฏิเสธ
7. เปิด frontend ด้วย `npm run dev` จาก `frontend`; ตั้ง `NEXT_PUBLIC_API_URL` ให้ตรง backend และ `FRONTEND_ORIGIN` ให้ตรง origin ของหน้าเว็บ
8. กรอกรหัสเข้าใช้งาน รหัสหน่วย และเดือน แล้วเปิด/สร้างตาราง รหัสเข้าใช้งานอยู่ในหน่วยความจำของหน้าเท่านั้น

## ข้อมูลพื้นฐานที่อ่าน
- บุคลากร: `nurses`; skills และ allowed_shift_codes เป็น JSON arrays
- เวร: `shift_types` ที่เปิดใช้งาน; เวรควบ ชบ/ดบ ตรวจสิทธิ์ควบเสมอ
- วันลา: `leave_requests`; approved เป็น hard, pending เป็น soft; end_date รวมวันสุดท้าย
- วันหยุด: `holidays.data` ของ year เป็น JSON array `[{date:"YYYY-MM-DD",name:"..."}]`
- นโยบาย: `roster_policies.policy`; แก้ policy มี audit และผลตรวจตารางจะคำนวณใหม่
- UI จัดการข้อมูลพื้นฐานและ lifecycle ของ policy ใน Sprint 2 ยังไม่ครบ รอบนี้เพิ่มเฉพาะการอ่านข้อมูลจริงและการตั้งค่าที่จำเป็นต่อ Sprint 3

## ความหมายของการตรวจ
- blank ยังไม่ได้จัด, X คือ OFF, L ต้องมีลาที่อนุมัติ ไม่มีชั่วโมงทำงานของ X/L
- check ไม่เขียนข้อมูล และไม่รับประกันว่า save จะผ่าน: save โหลดข้อมูลล่าสุดและตรวจซ้ำ
- hard error บล็อก save; head ใช้ override พร้อมเหตุผลอย่างน้อย 3 ตัวอักษรได้ โดยบันทึก violations และเหตุผลใน audit; locked cell ต้องปลดล็อกก่อนเสมอ
- draft เปล่าสร้างได้แม้ MIN_STAFFING ยังไม่ครบ การเติมทีละเซลล์ในตารางที่ยังผิด hard constraints ต้องใช้ workflow override อย่างชัดเจนตามแผน
- ล็อกไม่ข้ามการตรวจ hard errors ของบุคลากรนั้น โดยเฉพาะเวรทับลาที่อนุมัติ
- policy staffing date ว่างใช้ทุกวัน; เฉพาะวันที่กำหนดแทน default ที่ start/end เดียวกัน รายการช่วงอื่นยังตรวจแยก
- soft scores อยู่ใน metadata: ชั่วโมง/OFF/โควตาใช้ระยะห่างจากเป้าหมาย, preference ใช้ 1, fairness ใช้ส่วนที่เกินค่าความต่างชั่วโมง
- หน้าตารางแสดงชั่วโมงจริงในเดือน, ชั่วโมงกลางคืน, คืนตามวันที่เริ่มช่วงคืน, ชั่วโมงยกมา และชั่วโมงล้ำไปแยกกัน
- วันทำงานติดกันนับจากวันที่ในตาราง; กลางคืนใช้ union ช่วงเวลาจริง จึงไม่เพิ่มจำนวนคืนซ้ำจาก Night + ด

## รอยต่อและ concurrency
โหลดเวรเดือนข้างเคียงเต็มเดือน และขยายช่วงตามเพดานวันต่อเนื่องเมื่อจำเป็น (อย่างน้อย 7 วัน) ใช้ช่วง [start,end) และตัดชั่วโมงตามขอบเดือน ข้อมูลของ API boundary-data คำนวณใหม่จาก assignments ทุกครั้ง ไม่ใช้ cache ในตาราง schedule_boundary_data เพื่อหลีกเลี่ยงข้อมูลเก่าเมื่อแก้เดือนข้างเคียง

การเปลี่ยนเวร/ล็อก serialize ด้วย row lock ของ ward ภายใน transaction แล้วอ่าน snapshot ล่าสุด เพื่อไม่ให้สองเดือนของ ward เดียวกันตรวจด้วยข้อมูลเก่าพร้อมกัน version เปลี่ยนทุกครั้งที่แก้/ล็อก/ปลดล็อก ถ้า stale คืน 409 และผู้ใช้ต้องเปิดตารางใหม่

## Migration และ recovery
- เก็บ migration 016–019 เดิม
- เพิ่ม 020 roster_policies, 021 schedule_audit, 022 shift_types.periods
- MySQL DDL implicit commit จึงแยกแต่ละ migration เป็นหนึ่ง statement แล้วบันทึก version หลังสำเร็จ
- หาก process หยุดหลัง DDL แต่ก่อนบันทึก version ให้ DBA ตรวจ SHOW CREATE TABLE เทียบไฟล์และบันทึก version ที่ตรงกันก่อนเริ่มใหม่ ห้ามลบข้อมูลตารางเวรเพื่อแก้ migration
- rollback แอปให้คงตาราง/คอลัมน์ใหม่ไว้และใช้ roll-forward สำหรับ schema โดยเฉพาะ audit
- รอบพัฒนานี้ทดสอบ migration บนฐานชั่วคราวชื่อ nurse_s3_*_test เท่านั้น ไม่ได้ migrate ฐาน nurse

## การทดสอบ
- จาก backend: `go test ./...`, `go vet ./...`
- MySQL: ตั้ง `NURSE_MYSQL_TEST=1` แล้ว `go test ./...`; สร้างและลบเฉพาะฐานชั่วคราวที่ลงท้าย _test
- จาก frontend: `npm run lint`, `npm run build`
- จาก tests/e2e: `npm test`; ใช้ cmd/roster-test-api ที่เปิดได้เฉพาะ ROSTER_TEST_MODE=1 และ bind loopback ข้อมูลทั้งหมดสมมติ ไม่เชื่อม MySQL
- AUTO และ approval workflow อยู่ Sprint 4/6 ให้เรียก `validation.Validate(snapshot, originalAssignments)` ตัวเดียวกันเมื่อเพิ่ม workflow; endpoint AUTO เดิมยังเป็น 501 ไม่ใช่งานที่ประกาศว่าเสร็จใน Sprint 3
