-- Seed data for ward-1
INSERT INTO wards (id, name, timezone, version, created_by)
VALUES ('ward-1', 'หอผู้ป่วย 1 (Ward 1)', 'Asia/Bangkok', 1, 'admin')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO shift_types (id, ward_id, code, name, is_double, is_off, total_hours, is_enabled, version, periods, created_by)
VALUES 
  ('st-1', 'ward-1', 'ช', 'เช้า (08:00-16:00)', 0, 0, 8, 1, 1, '[{"start":480,"end":960}]', 'admin'),
  ('st-2', 'ward-1', 'บ', 'บ่าย (16:00-24:00)', 0, 0, 8, 1, 1, '[{"start":960,"end":1440}]', 'admin'),
  ('st-3', 'ward-1', 'ด', 'ดึก (00:00-08:00)', 0, 0, 8, 1, 1, '[{"start":0,"end":480}]', 'admin'),
  ('st-4', 'ward-1', 'ชบ', 'เช้าบ่าย (08:00-24:00)', 1, 0, 16, 1, 1, '[{"start":480,"end":960},{"start":960,"end":1440}]', 'admin'),
  ('st-5', 'ward-1', 'บด', 'บ่ายดึก (16:00-08:00)', 1, 0, 16, 1, 1, '[{"start":960,"end":1440},{"start":0,"end":480}]', 'admin'),
  ('st-6', 'ward-1', 'Day', 'กลางวัน (08:00-20:00)', 0, 0, 12, 1, 1, '[{"start":480,"end":1200}]', 'admin'),
  ('st-7', 'ward-1', 'Night', 'กลางคืน (20:00-08:00)', 0, 0, 12, 1, 1, '[{"start":1200,"end":1920}]', 'admin'),
  ('st-8', 'ward-1', 'X', 'OFF (วันหยุด)', 0, 1, 0, 1, 1, '[]', 'admin'),
  ('st-9', 'ward-1', 'L', 'ลา (Leave)', 0, 1, 0, 1, 1, '[]', 'admin')
ON DUPLICATE KEY UPDATE name=VALUES(name), periods=VALUES(periods);

INSERT INTO nurses (id, ward_id, name, position, is_charge_eligible, can_double_shift, is_active, skills, allowed_shift_codes, version, created_by)
VALUES
  ('n-1', 'ward-1', 'พว. สมศรี ใจดี', 'RN', 1, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('n-2', 'ward-1', 'พว. สมนึก มั่นคง', 'RN', 1, 1, 1, '["er"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('n-3', 'ward-1', 'พท. สมชาย ขยัน', 'PN', 0, 1, 1, '[]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin'),
  ('n-4', 'ward-1', 'พท. สมหญิง เมตตา', 'PN', 0, 0, 1, '[]', '["ช","บ","ด","Day","Night","X","L"]', 1, 'admin'),
  ('n-5', 'ward-1', 'พว. กานดา อบอุ่น', 'RN', 0, 1, 1, '["icu"]', '["ช","บ","ด","ชบ","บด","Day","Night","X","L"]', 1, 'admin')
ON DUPLICATE KEY UPDATE name=VALUES(name), position=VALUES(position);

INSERT INTO roster_policies (ward_id, policy)
VALUES (
  'ward-1',
  '{"status":"confirmed","version":"v1.0","minRestHours":8,"maxConsecutiveDays":6,"maxConsecutiveNights":3,"maxMonthlyHours":240,"maxContinuousHours":16,"maxDoubleShifts":8,"nightStart":1320,"nightEnd":1800,"fairnessHours":48,"weights":{"coverage":100,"fairness":50,"preference":20,"stability":10},"targets":[],"preferences":[],"staffing":[{"date":"","start":480,"end":960,"rn":1,"pn":1,"leaders":1,"skills":{}},{"date":"","start":960,"end":1440,"rn":1,"pn":1,"leaders":1,"skills":{}},{"date":"","start":0,"end":480,"rn":1,"pn":0,"leaders":1,"skills":{}}]}'
)
ON DUPLICATE KEY UPDATE policy=VALUES(policy);
