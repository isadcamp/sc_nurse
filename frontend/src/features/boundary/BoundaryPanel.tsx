"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "@/lib/api";
import type { Roster, RosterResponse } from "@/types/schedule";
import "./boundary.css";

interface BoundaryPanelProps {
  roster: Roster;
  token: string;
  onSaved: (updated: RosterResponse) => void;
  onBackToGrid: () => void;
}

const isRecorded = (code: string) => Boolean(code.trim()) && !/^\?+$/.test(code.trim());
const timeLabel = (minutes: number) => `${String(Math.floor(minutes % 1440 / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}${minutes >= 1440 ? " วันถัดไป" : ""}`;

export function BoundaryPanel(props: BoundaryPanelProps) {
  return <BoundaryEditor key={`${props.roster.id}:${props.roster.wardId}:${props.roster.year}:${props.roster.month}`} {...props} />;
}

function BoundaryEditor({ roster, token, onSaved, onBackToGrid }: BoundaryPanelProps) {
  const precedingDate = new Date(Date.UTC(roster.year, roster.month - 1, 0)).toISOString().slice(0, 10);
  const dateLabel = new Date(`${precedingDate}T12:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
  const monthLabel = new Date(Date.UTC(roster.year, roster.month - 1, 1)).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
  const staff = roster.staff.filter(n => n.active);
  const initial = () => Object.fromEntries(staff.map(n => {
    const code = roster.boundary?.find(c => c.nurseId === n.id && c.date === precedingDate)?.shiftCode ?? "";
    return [n.id, isRecorded(code) ? code : ""];
  }));
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [shifts, setShifts] = useState<Record<string, string>>(initial);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkShift, setBulkShift] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const selectRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const selectionRef = useRef<HTMLInputElement>(null);
  const lastMissing = useRef("");

  const options = useMemo(() => Array.from(new Map(roster.shifts.filter(s => isRecorded(s.code)).map(s => [s.code, {
    code: s.code,
    label: `${s.code} — ${s.name || s.code}${s.periods?.length ? " · " + s.periods.map(p => `${timeLabel(p.start)}–${timeLabel(p.end)}`).join(" / ") : ""}`,
  }])).values()), [roster.shifts]);
  const changed = staff.filter(n => (shifts[n.id] ?? "") !== (saved[n.id] ?? ""));
  const missing = staff.filter(n => !isRecorded(shifts[n.id] ?? ""));
  const visible = staff.filter(n => {
    const matchesQuery = `${n.name} ${n.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesQuery && (position === "all" || n.position === position) &&
      (status === "all" || (status === "missing" ? !isRecorded(shifts[n.id] ?? "") : (shifts[n.id] ?? "") !== (saved[n.id] ?? "")));
  });
  const allSelected = visible.length > 0 && visible.every(n => selected.has(n.id));
  useEffect(() => {
    if (selectionRef.current) selectionRef.current.indeterminate = !allSelected && visible.some(n => selected.has(n.id));
  }, [allSelected, selected, visible]);
  useEffect(() => {
    if (focusTarget) {
      const el = selectRefs.current[focusTarget.id];
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusTarget]);
  useEffect(() => {
    if (!changed.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed.length]);

  function change(id: string, code: string) {
    setShifts(prev => ({ ...prev, [id]: code }));
    setSuccess(""); setError("");
  }
  function nextMissing() {
    const index = missing.findIndex(n => n.id === lastMissing.current);
    const next = missing[(index + 1) % missing.length];
    if (!next) return;
    setQuery(""); setPosition("all"); setStatus("missing"); setSelected(new Set());
    lastMissing.current = next.id;
    setFocusTarget({ id: next.id });
  }
  function back() {
    if (!changed.length || window.confirm("มีการแก้ไขที่ยังไม่บันทึก ต้องการกลับตารางและละทิ้งการแก้ไขหรือไม่?")) onBackToGrid();
  }
  async function save() {
    const updates = Object.fromEntries(changed.filter(n => isRecorded(shifts[n.id] ?? "")).map(n => [n.id, shifts[n.id]]));
    if (!Object.keys(updates).length || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/boundary-shifts`, token, "POST", { date: precedingDate, shifts: updates });
      const confirmed = Object.fromEntries(staff.map(n => {
        const code = res.schedule.boundary?.find(c => c.nurseId === n.id && c.date === precedingDate)?.shiftCode ?? "";
        return [n.id, isRecorded(code) ? code : ""];
      }));
      setSaved(confirmed); setShifts(confirmed); setSelected(new Set());
      setSuccess(`บันทึกเวรวันก่อนหน้าแล้ว ${Object.keys(updates).length} คน`);
      onSaved(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่");
    } finally { setBusy(false); }
  }

  return <fieldset disabled={busy} className="boundary-workspace" aria-busy={busy}>
    <header className="boundary-heading">
      <div><h2>เวรวันสุดท้ายของเดือนก่อน</h2><p>แผนก {roster.wardId} · ใช้ตรวจการพักระหว่างเวรที่รอยต่อเดือน</p></div>
      <button type="button" onClick={back}>กลับสู่ตารางเวร</button>
    </header>
    <div className="boundary-date"><strong>{dateLabel}</strong><span>ใช้ตรวจรอยต่อเดือน{monthLabel}</span><small>ระบุเวรที่ปฏิบัติงานจริง • ช่องว่างหมายถึงยังไม่ทราบ ไม่ใช่วันหยุด</small></div>
    <div className="boundary-summary" aria-label="ความครบถ้วนของข้อมูล">
      <div><strong>{staff.length}</strong><span>บุคลากรทั้งหมด</span></div>
      <div><strong>{staff.length - missing.length}</strong><span>ระบุเวรแล้ว</span></div>
      <button type="button" onClick={() => { setStatus("missing"); setQuery(""); setPosition("all"); setSelected(new Set()); }}><strong>{missing.length}</strong><span>ยังไม่ระบุ · ดูรายชื่อ</span></button>
      <div><strong>{changed.length}</strong><span>แก้ไขรอบันทึก</span></div>
    </div>
    {error && <p role="alert" className="boundary-error">{error}</p>}
    {success && <p role="status" className="boundary-success">{success}</p>}
    <div className="boundary-filters">
      <label>ค้นหาบุคลากร<input type="search" value={query} placeholder="ชื่อ / รหัสบุคลากร" onChange={e => { setQuery(e.target.value); setSelected(new Set()); }} /></label>
      <label>กลุ่มบุคลากร<select aria-label="กลุ่มบุคลากร" value={position} onChange={e => { setPosition(e.target.value); setSelected(new Set()); }}><option value="all">ทุกกลุ่ม</option>{Array.from(new Set(staff.map(n => n.position))).map(p => <option key={p} value={p}>{p || "ไม่ระบุตำแหน่ง"}</option>)}</select></label>
      <label>สถานะการกรอก<select aria-label="สถานะการกรอก" value={status} onChange={e => { setStatus(e.target.value); setSelected(new Set()); }}><option value="all">ทั้งหมด</option><option value="missing">ยังไม่ระบุ</option><option value="changed">แก้ไขรอบันทึก</option></select></label>
      <button type="button" onClick={nextMissing} disabled={!missing.length}>ไปคนถัดไปที่ยังไม่ระบุ</button>
    </div>
    <div className="boundary-bulk">
      <span>เลือก {selected.size} คน</span>
      <select aria-label="เวรสำหรับคนที่เลือก" value={bulkShift} onChange={e => setBulkShift(e.target.value)}><option value="">เลือกเวรสำหรับกลุ่ม…</option>{options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
      <button type="button" disabled={!selected.size || !bulkShift} onClick={() => {
        setShifts(prev => ({ ...prev, ...Object.fromEntries(Array.from(selected).map(id => [id, bulkShift])) }));
        setSelected(new Set()); setSuccess(""); setError("");
      }}>กำหนดให้ {selected.size} คนที่เลือก</button>
      {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())}>ยกเลิกการเลือก</button>}
    </div>
    <div className="boundary-table-wrap">
      <table className="boundary-table">
        <caption>แสดง {visible.length} จาก {staff.length} คน · กรองรายชื่อได้โดยค่าที่กรอกไม่หาย</caption>
        <thead><tr><th><input ref={selectionRef} type="checkbox" aria-label="เลือกทุกคนที่แสดง" checked={allSelected} disabled={!visible.length} onChange={e => setSelected(e.target.checked ? new Set(visible.map(n => n.id)) : new Set())} /></th><th>บุคลากร</th><th>ตำแหน่ง</th><th>เวรวันที่ {precedingDate}</th><th>สถานะ</th></tr></thead>
        <tbody>{visible.map(n => {
          const code = shifts[n.id] ?? "";
          const dirty = code !== (saved[n.id] ?? "");
          const legacy = code && !options.some(o => o.code === code);
          return <tr key={n.id} className={isRecorded(code) ? "" : "is-missing"}>
            <td><input type="checkbox" aria-label={`เลือก ${n.name}`} checked={selected.has(n.id)} onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(n.id); else next.delete(n.id); return next; })} /></td>
            <th scope="row"><span>{n.name}</span><small>{n.id}</small></th>
            <td><span className="boundary-position">{n.position || "—"}</span></td>
            <td><select ref={el => { selectRefs.current[n.id] = el; }} aria-label={`เวรวันก่อนหน้า ${n.name}`} value={code} onChange={e => change(n.id, e.target.value)}>
              <option value="" disabled={Boolean(saved[n.id])}>ยังไม่ระบุ — เลือกเวร</option>
              {legacy && <option value={code}>{code} — ข้อมูลเดิม (ไม่มีในรายการเวรปัจจุบัน)</option>}
              {options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>{dirty && <button type="button" className="boundary-undo" aria-label={`คืนค่าเดิม ${n.name}`} onClick={() => change(n.id, saved[n.id] ?? "")}>คืนค่าเดิม</button>}</td>
            <td><span className={`boundary-status ${!isRecorded(code) ? "is-missing" : dirty ? "is-changed" : "is-saved"}`}>{!isRecorded(code) ? "ยังไม่ระบุ" : dirty ? "แก้ไขรอบันทึก" : "มีข้อมูลบันทึกแล้ว"}</span></td>
          </tr>;
        })}</tbody>
      </table>
      {!visible.length && <p className="boundary-empty">{staff.length ? "ไม่พบรายชื่อที่ตรงกับตัวกรอง" : "ไม่มีบุคลากรที่ใช้งานในหน่วยงานนี้"}</p>}
    </div>
    <footer className="boundary-actions">
      <div><strong>{changed.length ? `มี ${changed.length} คนที่แก้ไขรอบันทึก` : "ไม่มีการแก้ไขที่รอบันทึก"}</strong><p>{missing.length ? `ยังไม่ระบุ ${missing.length} คน · บันทึกส่วนที่กรอกแล้วก่อนได้` : "ระบุเวรครบทุกคนแล้ว"}</p><small>บันทึกเฉพาะรายการที่แก้ไขไปยังวันสุดท้ายของเดือนก่อนหน้า</small></div>
      <button type="button" className="boundary-primary" onClick={save} disabled={busy || !changed.length}>{busy ? "กำลังบันทึก…" : `บันทึกการแก้ไข ${changed.length} คน`}</button>
    </footer>
  </fieldset>;
}
