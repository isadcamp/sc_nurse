# Sprint 4 acceptance

ผู้ใช้หลัก: หัวหน้าหน่วยงานที่มีสิทธิ์แก้ตาราง; viewer ดูผลได้เฉพาะหน่วยงานตน

- AUTO ใช้ข้อมูลจาก backend พร้อม hash ครอบคลุมตาราง กฎ บุคลากร ลา และรอยต่อเดือน; รุ่นไม่ตรงต้องตอบ conflict
- Readiness ต้องระบุ code, field, date, nurseId, fixPath; ข้อมูลไม่ครบหรือเวรล็อกผิดกฎต้องไม่สร้างงาน
- ชุดตั้งค่าต้อง confirmed สำหรับ AUTO; simulation ใช้ draft ได้และไม่แก้ตาราง
- Solver แยก interface ใช้ backtracking และตัวตรวจกฎกลาง; ไม่ลดข้อบังคับตามน้ำหนักคะแนน
- ผล complete ผ่านทุก hard constraint; partial ขาดกำลัง; timeout ไม่ใช่ข้อพิสูจน์ infeasible
- เก็บ snapshot/job/score ใน MySQL; ยกเลิกและกู้สถานะ interrupted หลัง restart ได้
- ผลเป็นข้อเสนอแยก ต้องสั่งใช้ผลโดยชัดแจ้ง และเทียบ hash/ตรวจซ้ำภายใน transaction ก่อนบันทึก
- ขอบเขตวันที่/บุคลากรต้องถูกต้อง; ทุกเซลล์นอกขอบเขตและเซลล์ล็อกคงเดิม
- HTTP ตรวจ JSON, สิทธิ์, version, สถานะ และขนาดข้อมูล; UI แสดง readiness/job/result/stale/error
- ทดสอบ unit, HTTP, MySQL isolated test database, frontend lint/build และ critical journey

Migration เริ่ม 023 เพราะ 020–022 ถูกใช้ใน Sprint 3 แล้ว ห้ามแก้ migration เดิม
