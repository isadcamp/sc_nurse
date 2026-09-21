# Nurse Scheduler — Development Rules

เอกสารนี้เป็นมาตรฐานหลักสำหรับการพัฒนาโปรเจกต์ Nurse Scheduler ทั้งมนุษย์และ AI ต้องอ่านก่อนแก้ไขโค้ด และต้องใช้ร่วมกับ acceptance criteria ของแต่ละ feature หากข้อกำหนดขัดกัน ให้ใช้ลำดับความสำคัญดังนี้:

1. กฎธุรกิจและข้อกำหนดที่ผู้ใช้ยืนยันล่าสุด
2. ความปลอดภัย ความถูกต้องของข้อมูล และกฎหมาย/นโยบายของหน่วยงาน
3. เอกสารนี้
4. รูปแบบเดิมของโค้ดในพื้นที่ที่แก้ไข

คำว่า **MUST**, **SHOULD**, **MAY** ในเอกสารนี้หมายถึง ต้องทำ, ควรทำ และเลือกทำได้ตามลำดับ

## 1. หลักการพัฒนา

- MUST ให้ความถูกต้องของตารางเวรและการตรวจสอบย้อนหลังสำคัญกว่าความเร็วในการพัฒนา
- MUST เขียน acceptance criteria ก่อนเริ่ม feature โดยระบุ happy path, invalid input, edge cases และ failure states
- MUST แยกกฎที่ห้ามละเมิด (hard constraint) ออกจากกฎที่ใช้จัดลำดับคุณภาพ (soft constraint)
- MUST ไม่ซ่อนการละเมิดกฎ ตารางที่สร้างไม่สมบูรณ์ต้องรายงานสถานะและเหตุผลอย่างชัดเจน
- MUST ไม่ใช้ข้อมูลจำลองใน production path โดยไม่มีการระบุชัดเจนว่าเป็น development fixture
- SHOULD ทำการเปลี่ยนแปลงให้เล็ก มีขอบเขตชัด และทดสอบได้อิสระ
- SHOULD เลือกโครงสร้างที่เรียบง่ายที่สุดที่ยังรักษาขอบเขตของแต่ละชั้นได้
- MUST ไม่ refactor ส่วนที่ไม่เกี่ยวข้องกับงานโดยไม่มีเหตุผลและการทดสอบรองรับ
- MUST ไม่เก็บ secret, password, token หรือข้อมูลส่วนบุคคลจริงไว้ใน source code, log หรือ test fixture

## 2. โครงสร้างและทิศทาง Dependency

โครงสร้างเป้าหมาย:

```text
frontend/                       Next.js application
  src/app/                      routes, layouts และ page composition
  src/features/<feature>/       UI และ logic เฉพาะ feature
  src/components/               shared presentation components
  src/lib/                      API client และ shared infrastructure
  src/types/                    shared/generated API types

backend/
  cmd/api/                      application entry point และ dependency wiring
  internal/domain/              entities, value objects และ domain errors
  internal/service/             application use cases และ transaction boundary
  internal/scheduler/           schedule generation และ scoring
  internal/validation/          schedule rules และ violation reporting
  internal/repository/          repository interfaces
  internal/platform/database/   database implementations
  internal/httpapi/             HTTP DTO, handler, middleware และ response mapping
  migrations/                   immutable database migrations

docs/openapi.yaml               API contract
tests/e2e/                      user journey tests
templates/feature.md            feature/acceptance template
```

Dependency ต้องไหลเข้าหา domain:

```text
HTTP/UI -> Application Service -> Domain/Rules
                              -> Repository Interface
Database Adapter ------------> Repository Interface
```

- MUST ห้าม `domain` import `httpapi`, database driver หรือ framework
- MUST ห้าม handler เข้าถึงฐานข้อมูลโดยตรง
- MUST ห้าม UI ฝัง business rule ที่ backend ต้องบังคับใช้
- MUST ประกอบ concrete dependencies ที่ `cmd/api` หรือ composition root เท่านั้น
- SHOULD สร้าง interface เมื่อมี boundary จริง เช่น database, clock, ID generator หรือ solver ไม่สร้าง interface ให้ทุก struct โดยอัตโนมัติ

## 3. มาตรฐานการสร้าง Domain

### 3.1 Entity และ Value Object

- Entity MUST มี identity ที่คงที่ เช่น `NurseID`, `ScheduleID`
- Value object MUST แทนแนวคิดที่มีกฎของตัวเอง เช่น `DateRange`, `ShiftCode`, `ScheduleStatus`, `RestDuration`
- MUST ใช้ชนิดข้อมูลเฉพาะแทน string/int อิสระเมื่อค่ามีความหมายทางธุรกิจ
- MUST ป้องกัน invalid state ที่จุดสร้าง object ผ่าน constructor หรือ validation function
- MUST เก็บ invariant ไว้ใน domain/rule layer ไม่กระจายซ้ำใน handler และ UI
- SHOULD ใช้เวลาแบบชัดเจน: วันปฏิทินใช้รูปแบบ `YYYY-MM-DD`; timestamp เก็บเป็น UTC; timezone ของหน่วยงานต้องเป็น configuration
- MUST หลีกเลี่ยง `map[string]any` ใน core domain

### 3.2 Domain model กับ Transport DTO

- HTTP request/response DTO MUST อยู่ใน `internal/httpapi` ไม่รวมกับ entity โดยไม่จำเป็น
- Database model MAY แยกจาก domain model เมื่อ schema และ domain มีหน้าที่ต่างกัน
- Mapping ระหว่าง DTO, domain และ persistence MUST เป็น explicit function และมี test เมื่อมี transformation
- Frontend types SHOULD สร้างจาก OpenAPI เมื่อระบบเริ่มมีหลาย endpoint; ห้ามรักษา type ซ้ำด้วยมือโดยไม่มี contract test

### 3.3 Domain errors

- MUST ใช้ error ที่จำแนกประเภทได้ เช่น validation, conflict, not found, forbidden และ internal
- Error สำหรับผู้ใช้ MUST ปลอดภัยและเข้าใจได้; internal error detail บันทึกใน log เท่านั้น
- Rule violation MUST มีอย่างน้อย: rule code, severity, date/shift, subject ID, message และ metadata ที่จำเป็น
- MUST ไม่ใช้การเปรียบเทียบข้อความ error เพื่อควบคุม business flow

## 4. กฎของ Scheduler และ Validation

- MUST นิยามทุกกฎด้วยรหัสที่คงที่และมี unit test อิสระ
- MUST ระบุว่าแต่ละกฎเป็น hard หรือ soft constraint
- MUST ใช้ rule engine ชุดเดียวกันสำหรับผลจาก solver และตารางที่ผู้ใช้แก้ด้วยมือ
- MUST validate input และความพร้อมของข้อมูลก่อนเริ่ม generate
- MUST validate ผลลัพธ์ทั้งหมดอีกครั้งก่อนบันทึกหรือเปลี่ยนสถานะเป็นพร้อมตรวจสอบ
- Scheduler input MUST เป็น snapshot ที่ครบถ้วน ไม่อ่านฐานข้อมูลทีละรายการระหว่างคำนวณ
- Scheduler output MUST ระบุ `complete`, `partial` หรือ `infeasible` พร้อม violations และ diagnostics
- SHOULD ให้ผลลัพธ์ทำซ้ำได้เมื่อ input, configuration และ random seed เหมือนกัน
- MUST ไม่ใช้เวลาปัจจุบันเป็น schedule ID; ใช้ collision-resistant ID generator
- SHOULD แยก objective score เช่น coverage, fairness, preference และ stability เพื่ออธิบายคุณภาพผลลัพธ์ได้
- MUST ทดสอบรอยต่อวัน/เดือน, เวรข้ามเที่ยงคืน, timezone, วันลา, เวรเดิมก่อนช่วงที่สร้าง และกรณีไม่มีคำตอบ

## 5. Repository และฐานข้อมูล

- ฐานข้อมูลมาตรฐานของโครงการคือ **MySQL** และใช้ชื่อ database ว่า **`nurse`**
- ชื่อ host, port, username และ password MUST อ่านจาก environment/configuration ห้ามฝังไว้ใน source code
- Database name MAY กำหนดจาก configuration สำหรับ test environment แต่ production/default project database ต้องใช้ `nurse`
- MUST ใช้ `utf8mb4` และกำหนด collation ให้เหมือนกันทั้ง database, table และ connection
- MUST กำหนด timezone ของ database connection อย่างชัดเจน โดย timestamp เก็บเป็น UTC และวันปฏิทินเก็บด้วยชนิด `DATE`
- Integration tests MUST ใช้ database แยกจาก `nurse` เช่น `nurse_test` และห้ามล้างหรือแก้ข้อมูลใน development/production database
- Repository interface MUST สื่อด้วยภาษาของ domain เช่น `FindActiveNurses`, `SaveSchedule` ไม่เปิดเผย SQL abstraction
- Application service MUST เป็นผู้กำหนด transaction boundary
- MUST ใช้ parameterized query ห้ามประกอบ SQL จาก input ด้วย string concatenation
- MUST มี foreign keys, unique constraints และ indexes ที่รองรับ invariant สำคัญ
- MUST ป้องกัน lost update สำหรับการแก้/อนุมัติตาราง เช่น version column หรือ optimistic locking
- MUST บันทึก audit trail สำหรับการสร้าง แก้ไข ส่งตรวจ อนุมัติ และประกาศตาราง
- Migration ที่ใช้งานร่วมกันแล้ว MUST ไม่ถูกแก้ย้อนหลัง ให้สร้าง migration ใหม่
- Migration MUST มีชื่อสื่อความหมาย ลำดับชัด และมีวิธี rollback หรือ recovery ที่บันทึกไว้
- Test fixtures MUST เป็นข้อมูลสมมติและไม่ใช้ข้อมูลพนักงานจริง

## 6. Application Service และ Workflow

- หนึ่ง use case SHOULD มี entry point ชัดเจน เช่น `GenerateSchedule`, `ApproveSchedule`
- Application service MUST ตรวจ authorization, โหลดข้อมูล, เรียก domain logic และ persist ภายในขอบเขตที่เหมาะสม
- MUST บังคับ state transition ของตาราง เช่น:

```text
draft -> generated -> under_review -> approved -> published
```

- การย้อนสถานะหรือแก้ตารางหลังอนุมัติ MUST เป็นคำสั่งที่ชัดเจนและมี audit record
- Command ที่อาจถูกส่งซ้ำ SHOULD รองรับ idempotency
- MUST ไม่ทำงานหนักหรือเรียก external service ขณะถือ database transaction โดยไม่จำเป็น

## 7. HTTP API Standard

- Base path ใช้ `/api/v1`; breaking change ต้องออก API version ใหม่หรือมี migration plan
- Resource ใช้คำนามพหูพจน์และ HTTP method ตามความหมาย
- MUST ตรวจ Content-Type, ขนาด body, unknown fields, required fields, range และ trailing JSON data
- MUST ส่ง status code ให้ตรงความหมาย เช่น 200, 201, 204, 400, 401, 403, 404, 409, 422 และ 500
- Error response MUST มีโครงสร้างคงที่:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "ข้อความที่ปลอดภัยสำหรับผู้ใช้",
    "details": []
  },
  "requestId": "..."
}
```

- MUST ไม่ส่ง stack trace, SQL error หรือ secret กลับไปยัง client
- Collection endpoint MUST เตรียม pagination/filtering เมื่อข้อมูลไม่จำกัดขนาด
- MUST อัปเดต `docs/openapi.yaml` พร้อมกับ endpoint และ schema ที่เปลี่ยน
- OpenAPI MUST ระบุ request, success response, error response, required fields, examples และ validation constraints
- CORS MUST จำกัด origin จาก configuration; production ห้ามใช้ wildcard ร่วมกับ credential

## 8. Go Coding Standard

- MUST ผ่าน `gofmt`, `go test ./...` และ `go vet ./...`
- Package name ใช้คำสั้น ตัวพิมพ์เล็ก และไม่ซ้ำคำโดยไม่จำเป็น
- Exported identifier MUST มีเหตุผลที่ต้องเปิดเผย; ค่าอื่นเก็บเป็น private
- Function SHOULD ทำหน้าที่เดียว; แยกเมื่อเริ่มมี validation, persistence และ mapping ปะปนกัน
- MUST ส่ง `context.Context` เป็น parameter แรกสำหรับงาน I/O และ use case ที่ยกเลิกได้
- MUST wrap error พร้อมบริบทโดยรักษา cause และใช้ `errors.Is/As` เมื่อต้องจำแนก
- MUST ไม่ ignore error ยกเว้นมีเหตุผลที่ปลอดภัยและบันทึกไว้
- MUST inject clock และ ID generator ใน code ที่ต้องทดสอบเวลา/identity
- Shared mutable state MUST มี synchronization หรือออกแบบให้ immutable
- SHOULD ใช้ table-driven tests สำหรับ validation หลายกรณี
- ห้ามใช้ panic สำหรับ input หรือ business error ที่คาดหมายได้

## 9. TypeScript และ Next.js Standard

- MUST เปิดและรักษา TypeScript strict mode
- ห้ามใช้ `any` โดยไม่มีเหตุผลที่ระบุไว้; ใช้ `unknown` แล้ว narrow type
- Component MUST ไม่ทำ business validation แทน backend
- Page SHOULD ทำหน้าที่ compose feature; logic ที่นำกลับใช้ได้เก็บใน `features` หรือ `lib`
- API client MUST แยก network error, timeout, HTTP error และ validation error
- MUST แสดง loading, empty, success, partial และ failure states ตามลักษณะ feature
- Form MUST ป้องกันการ submit ซ้ำและแสดง field-level error เมื่อ backend ระบุได้
- MUST ใช้ semantic HTML, keyboard navigation, label ที่สัมพันธ์กับ input และสีที่มี contrast เหมาะสม
- ตารางข้อมูล SHOULD มี caption/header scope และใช้งานได้บนหน้าจอเล็ก
- MUST ไม่ฝัง API URL, timezone, ward ID หรือ policy ที่เปลี่ยนตาม environment ใน component
- ก่อนแก้ Next.js code MUST อ่านคำแนะนำที่ `frontend/AGENTS.md` และเอกสารของ Next.js version ที่ติดตั้ง
- MUST ผ่าน `npm run lint` และ `npm run build`

## 10. Naming และรูปแบบการเขียน

- ชื่อ code identifiers ใช้ภาษาอังกฤษ; ข้อความ UI และเอกสารผู้ใช้ใช้ภาษาไทยที่สม่ำเสมอ
- Go: exported identifier ใช้ PascalCase, local ใช้ camelCase
- TypeScript: component/type/interface ใช้ PascalCase; function/variable ใช้ camelCase
- Database: ใช้ `snake_case`, primary key ลงท้าย `_id` เมื่อเป็น foreign key
- API JSON: ใช้ `camelCase`
- Test name MUST บอกเงื่อนไขและผลที่คาดหวัง ไม่ใช้ชื่อกว้างเช่น `TestService`
- Constant และ rule code MUST มีชื่อสื่อความหมายและไม่ใช้ magic string/number กระจายหลายจุด
- Comment อธิบาย “เหตุผล” หรือข้อจำกัด ไม่บรรยายสิ่งที่ code แสดงอยู่แล้ว
- TODO MUST ระบุเหตุผลและ issue/reference ถ้ามี ห้ามใช้ TODO เพื่อซ่อนงานที่จำเป็นต่อ correctness

## 11. Testing Standard

ทุก feature MUST มีการทดสอบตามความเสี่ยง ไม่วัดคุณภาพจาก coverage percentage เพียงอย่างเดียว

### 11.1 Domain และ rule unit tests

- ทดสอบ happy path, boundary, invalid state และทุก hard constraint
- Soft constraint MUST ทดสอบคะแนนและลำดับความสำคัญ
- Test MUST deterministic และไม่ขึ้นกับเวลาจริง ลำดับ map หรือ network
- Scheduler test MUST ตรวจ invariant ของผลทั้งหมด ไม่ตรวจเพียงจำนวน assignment

### 11.2 Repository integration tests

- ทดสอบกับ database engine/schema จริงที่ production ใช้
- ทดสอบ constraints, transaction, rollback, concurrency และ mapping
- MUST แยก test database และทำ cleanup แบบปลอดภัย

### 11.3 HTTP/API tests

- ทดสอบ success, malformed JSON, trailing JSON, unknown field, missing field, invalid range, oversized body และ domain conflict
- ทดสอบ authentication/authorization แยกตาม role
- ตรวจทั้ง status, headers และ response schema
- SHOULD ตรวจว่า OpenAPI contract ตรงกับ implementation

### 11.4 Frontend tests

- Component tests สำหรับ interaction, validation display และ accessibility ที่สำคัญ
- E2E ใช้เฉพาะ critical user journeys ไม่ใช้แทน unit/integration tests ทั้งหมด
- E2E MUST ใช้ stable locator เช่น role, label หรือ test ID ไม่ผูกกับ CSS class เพื่อการนำเสนอ
- Test MUST สร้างข้อมูลของตัวเองและไม่พึ่งลำดับการรัน

### 11.5 Regression tests

- ทุก bug fix MUST มี test ที่ล้มก่อนแก้และผ่านหลังแก้ เมื่อทำได้
- การแก้ scheduler MUST เพิ่มกรณีที่พิสูจน์ว่า invariant เดิมไม่ถดถอย

## 12. Security และข้อมูลส่วนบุคคล

- MUST ใช้ authentication และ server-side authorization กับทุก endpoint ที่ไม่เป็น public
- MUST ใช้ least privilege สำหรับ database และ service accounts
- Password MUST hash ด้วย algorithm ที่ยอมรับในปัจจุบัน หรือใช้ระบบ identity ของหน่วยงาน
- MUST validate และ normalize input ที่ trust boundary
- MUST ป้องกัน injection, broken access control, CSRF ตามรูปแบบ authentication และ rate abuse
- Log MUST ไม่บันทึก password, token, health data หรือข้อมูลส่วนบุคคลเกินความจำเป็น
- Audit log MUST ระบุผู้กระทำ เวลา การกระทำ และ object โดยไม่เก็บ secret
- Dependency และ framework version MUST ถูกตรวจช่องโหว่ก่อน release

## 13. Logging, Monitoring และเวลา

- Backend SHOULD ใช้ structured log ที่มี request ID, operation และ duration
- MUST แยก log level และไม่ใช้ error log สำหรับเหตุการณ์ปกติ
- Health endpoint SHOULD แยก liveness และ readiness เมื่อเพิ่ม database/external dependencies
- MUST มี metrics สำหรับ generate duration, success/partial/infeasible count และ rule violations ที่สำคัญ
- Timestamp ใน API และฐานข้อมูล MUST เป็น UTC พร้อม timezone indicator
- การแสดงผลวันเวลาใน UI MUST ใช้ timezone ของหน่วยงานที่กำหนดจาก configuration

## 14. Git, Dependency และ Generated Files

- MUST ใช้ Git ก่อนเริ่มพัฒนาร่วมกัน และ commit ต้องมีขอบเขตชัด
- MUST มี `.gitignore` สำหรับ `node_modules`, `.next`, Go/npm caches, Playwright report, downloaded browsers, environment files และ build artifacts
- ห้าม commit generated binaries, browser runtimes, local caches หรือ secrets
- Lockfiles MUST ถูก commit และเปลี่ยนพร้อม dependency ที่เกี่ยวข้อง
- Dependency ใหม่ MUST มีเหตุผลชัด ตรวจ license/security และหลีกเลี่ยง package ที่ทำงานเล็กน้อยเกินไป
- Generated code MUST ระบุคำสั่งสร้างและห้ามแก้ด้วยมือ

## 15. ขั้นตอนพัฒนา Feature

1. เขียน objective, actors, business rules และ acceptance criteria ในรูปแบบ `templates/feature.md`
2. ระบุ hard/soft constraints, permission และ audit requirements
3. อัปเดต domain model และเขียน domain/rule tests
4. ออกแบบ migration และ repository interface หากต้องเก็บข้อมูล
5. อัปเดต OpenAPI ก่อนหรือพร้อม implementation
6. เขียน application service และ transaction boundary
7. เขียน repository adapter และ HTTP handler
8. เขียน/ปรับ frontend ตาม API contract
9. เพิ่ม unit, integration, API และ E2E tests ตามความเสี่ยง
10. รัน verification ทั้งหมดและบันทึกข้อจำกัดที่ยังเหลือ

## 16. Definition of Done

งานถือว่าเสร็จเมื่อ:

- Acceptance criteria ผ่านครบและไม่มี requirement ที่ถูกตีความโดยไม่บันทึก
- Domain invariant และ permissions ถูกบังคับใช้ฝั่ง server
- Schema/API documentation อัปเดตตรงกับ implementation
- มี tests ในระดับที่เหมาะสม รวม invalid และ boundary cases
- `gofmt`, `go test ./...`, `go vet ./...`, frontend lint และ production build ผ่าน
- Critical journey ที่ได้รับผลกระทบผ่าน E2E หรือมีเหตุผลบันทึกว่าทำไมไม่รัน
- ไม่มี secret, personal data, generated artifacts หรือ debug code หลุดเข้า source
- Error, loading, empty และ partial-result states ใช้งานได้
- Security, accessibility, migration, rollback/recovery และ observability ได้รับการพิจารณา
- Known limitations ถูกบันทึกอย่างตรงไปตรงมา

## 17. สิ่งที่ห้ามทำ

- ห้ามให้ frontend เป็นผู้ตัดสินความถูกต้องของตารางเพียงชั้นเดียว
- ห้ามบันทึกหรือประกาศตารางที่มี hard constraint violation โดยไม่มี workflow override ที่กำหนดสิทธิ์ เหตุผล และ audit ชัดเจน
- ห้ามแก้ข้อมูล production โดยตรงเพื่อทดแทน migration หรือ use case
- ห้ามคืน success เมื่อระบบทำงานได้เพียงบางส่วนโดยไม่ระบุสถานะ `partial`
- ห้ามใช้ข้อมูลจริงใน automated tests
- ห้ามปิด test/linter หรือกลืน error เพื่อให้ pipeline ผ่าน
- ห้ามเพิ่ม abstraction, framework หรือ dependency โดยไม่มีปัญหาจริงที่มันแก้
- ห้ามเปลี่ยน API/schema แบบ breaking โดยไม่อัปเดต version, consumer และ migration plan
