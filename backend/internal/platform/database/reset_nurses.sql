-- Set character set
SET NAMES utf8mb4;

USE nurse;

-- 1. Clear old nurses and old assignments
DELETE FROM assignment_locks;
DELETE FROM schedule_assignments;
DELETE FROM leave_requests;
DELETE FROM payroll_overrides;
DELETE FROM nurses;

-- 2. Insert 14 staff members for ward-1 (12 RN + 2 PN)
INSERT INTO nurses (id, ward_id, name, position, is_charge_eligible, can_double_shift, is_active, skills, allowed_shift_codes, version, created_by)
VALUES
  ('558210', 'ward-1', 'อภิญญา ประทุมตรี', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('563546', 'ward-1', 'จุฑารัตน์ จันทราเทพ', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('564247', 'ward-1', 'อรวรรณ อภิกรกุล', 'RN', 1, 1, 1, '["er"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('565053', 'ward-1', 'ศิริวัฒนา รักแก้ว', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('565066', 'ward-1', 'ศรัณย์พัชญ์ มัดทองหลาง', 'RN', 1, 1, 1, '["er"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('566138', 'ward-1', 'วีรภัทรา พลหล้า', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('566264', 'ward-1', 'ปริมล จอดนอก', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('567265', 'ward-1', 'ญาณิศา ศรีมะดัน', 'RN', 1, 1, 1, '["er"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('568154', 'ward-1', 'พัชราภรณ์ ศรีอุดร', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('569085', 'ward-1', 'ฑิตฐิตา จำเริญใจ', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('569086', 'ward-1', 'เมลิณญ์ดา เพ็ชรรัมย์', 'RN', 1, 1, 1, '["er"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('569126', 'ward-1', 'อภิญญา ฉิมกลาง', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('569215', 'ward-1', 'น้องนุช บริบูรณ์', 'RN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('569217', 'ward-1', 'พัสช์ณัฐสา มะลิวัลย์', 'RN', 1, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('563072', 'ward-1', 'สุพัตรา ด้วงกระโทก', 'PN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('563205', 'ward-1', 'ประณิตา พลคงนอก', 'PN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('563338', 'ward-1', 'บุษกร ปัตตายโส', 'PN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('564258', 'ward-1', 'อุไรวรรณ ตุ๋ยกระโทก', 'PN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('566455', 'ward-1', 'กุลิกา ควนสันเทียะ', 'PN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('563129', 'ward-1', 'สาริศา กลยนีย์', 'PN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('566329', 'ward-1', 'ณัฐพร งามเกษม', 'PN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin');

-- Update shift_types from ดบ to บด
UPDATE shift_types SET code = 'บด', name = 'บ่ายดึก (16:00-08:00)', periods = '[{"start":960,"end":1440},{"start":0,"end":480}]' WHERE code = 'ดบ';

-- Update schedule #1 status back to draft for fresh editing
UPDATE schedules SET status = 'draft' WHERE id = 1;
