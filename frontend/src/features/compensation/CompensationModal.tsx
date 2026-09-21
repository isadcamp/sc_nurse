"use client";
import { useState } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { BanknotesIcon, CalendarDaysIcon, CheckCircleIcon, SparklesIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { request } from "@/lib/api";
import type { Roster, RosterResponse } from "@/types/schedule";

interface CompensationModalProps {
  roster: Roster;
  token: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: RosterResponse) => void;
}

export function CompensationModal({ roster, token, isOpen, onClose, onSaved }: CompensationModalProps) {
  const currentPolicy = roster.policy || {};
  const comp = currentPolicy.compensation || {};

  // Compute default working days from month if not set
  const defaultWorkingDays = () => {
    if (comp.workingDays && comp.workingDays > 0) return comp.workingDays;
    const year = roster.year || new Date().getFullYear();
    const month = roster.month || 9;
    const daysInMonth = new Date(year, month, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
    }
    return count > 0 ? count : 22;
  };

  const initRnOtRate = () => {
    if (!comp.rnOtRate) return 100;
    return comp.rnOtRate > 250 ? Math.round(comp.rnOtRate / 8) : comp.rnOtRate;
  };

  const initPnOtRate = () => {
    if (!comp.pnOtRate) return 75;
    return comp.pnOtRate > 250 ? Math.round(comp.pnOtRate / 8) : comp.pnOtRate;
  };

  const [workingDays, setWorkingDays] = useState<number>(defaultWorkingDays);
  const [allowanceCap, setAllowanceCap] = useState<number>(comp.allowanceCap ?? 0);
  const [rnEveNightRate, setRnEveNightRate] = useState<number>(comp.rnEveNightRate ?? 240);
  const [pnEveNightRate, setPnEveNightRate] = useState<number>(comp.pnEveNightRate ?? 180);
  const [rnOtRate, setRnOtRate] = useState<number>(initRnOtRate);
  const [pnOtRate, setPnOtRate] = useState<number>(initPnOtRate);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const baseHours = workingDays * 8;

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...currentPolicy,
        compensation: {
          workingDays: Number(workingDays),
          allowanceCap: Number(allowanceCap),
          rnEveNightRate: Number(rnEveNightRate),
          pnEveNightRate: Number(pnEveNightRate),
          rnOtRate: Number(rnOtRate),
          pnOtRate: Number(pnOtRate),
        },
      };

      await request(`/wards/${encodeURIComponent(roster.wardId)}/roster-policy`, token, "PUT", payload);
      const updated = await request<RosterResponse>(`/schedules/${roster.id}`, token);
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  return (
    <ModalFrame
      title="ตั้งค่าวันทำการ & ค่าตอบแทนเวร/OT ประจำเดือน"
      onClose={onClose}
    >
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-[92vw] md:w-[66.67vw] max-w-6xl h-[75vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <BanknotesIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                ตั้งค่าวันทำการ & ค่าตอบแทนเวร/OT ประจำเดือน — {roster.wardId}
              </h3>
              <p className="text-xs text-slate-400">
                กำหนดเกณฑ์วันทำการปกติ, เรทค่าเวรบ่าย-ดึก (บด), ค่า OT และเพดานสิทธิเบิกประจำเดือน {roster.month}/{roster.year}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="text-slate-400 hover:text-white transition p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 font-semibold">
              <span className="font-bold">เกิดข้อผิดพลาด:</span> {error}
            </div>
          )}

          {/* Section 1 & 2 in 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 1. Monthly Working Days Configuration */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                    <CalendarDaysIcon className="w-4 h-4 text-indigo-600" />
                    <span>เกณฑ์วันทำการประจำเดือน (Working Days Base)</span>
                  </div>
                  <span className="text-[11px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">
                    เดือน {roster.month}/{roster.year}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  ใช้เป็นฐานคิดเวรปกติ โดยชั่วโมงทำงานที่เกินเกณฑ์จะถูกคำนวณเป็น <strong>เวร OT</strong> อัตโนมัติ
                </p>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-200/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-700">จำนวนวันทำการ:</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={workingDays}
                      onChange={(e) => setWorkingDays(Math.max(1, Number(e.target.value)))}
                      className="w-20 px-2.5 py-1.5 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600 font-medium">วัน</span>
                  </div>

                  <div className="text-xs text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-medium">
                    = <span className="font-bold text-indigo-600">{baseHours}</span> ชม. ปกติ ({workingDays} เวร)
                  </div>
                </div>

                {/* Quick preset buttons */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 font-medium">ลัด:</span>
                  {[20, 21, 22, 23].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setWorkingDays(d)}
                      className={`px-2.5 py-0.5 text-[11px] rounded-lg border transition font-bold cursor-pointer ${
                        workingDays === d
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {d} วัน
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Monthly Allowance Cap (เพดานสิทธิเบิกค่าเวร บด) */}
            <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 font-bold text-purple-950 text-xs">
                    <span className="px-1.5 py-0.5 bg-purple-600 text-white rounded text-[10px] font-bold">CAP</span>
                    <span>เพดานสิทธิเบิกค่าเวร บด ประจำเดือน (Allowance Cap)</span>
                  </div>
                  <span className="text-[11px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-md">
                    {allowanceCap > 0 ? `จำกัด ${allowanceCap} วัน` : "ไม่จำกัดเพดาน"}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  กำหนดจำนวนวัน/เวรสูงสุดที่เบิกค่าเวร บด ได้ในงวดเดือนนี้ (ส่วนเกินจะไม่นำไปคิดเงิน)
                </p>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-purple-200/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-700">เพดานสิทธิเบิก:</label>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={allowanceCap}
                      onChange={(e) => setAllowanceCap(Math.max(0, Number(e.target.value)))}
                      className="w-20 px-2.5 py-1.5 text-xs font-bold text-slate-800 bg-white border border-purple-300 rounded-lg text-center focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600 font-medium">วัน/หน่วย</span>
                  </div>

                  <span className="text-[11px] text-purple-700 italic">
                    {allowanceCap === 0 ? "*(ใส่ 0 = เบิกได้ไม่จำกัด)" : ""}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 font-medium">ลัด:</span>
                  {[0, 15, 17, 20].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAllowanceCap(c)}
                      className={`px-2.5 py-0.5 text-[11px] rounded-lg border transition font-bold cursor-pointer ${
                        allowanceCap === c
                          ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {c === 0 ? "ไม่จำกัด" : `${c} วัน`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Rates Setup (RN vs PN) in 2-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* RN Column */}
            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <div className="flex items-center gap-2 font-bold text-emerald-950 text-xs">
                  <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[10px] font-bold">RN</span>
                  <span>พยาบาลวิชาชีพ (Registered Nurse)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ค่าเวรบ่าย-ดึก (บด):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={rnEveNightRate}
                      onChange={(e) => setRnEveNightRate(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs font-bold text-slate-800 bg-white border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="text-slate-500 text-[11px] whitespace-nowrap font-medium">บาท/เวร</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ค่าล่วงเวลา (OT):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={rnOtRate}
                      onChange={(e) => setRnOtRate(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs font-bold text-slate-800 bg-white border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="text-emerald-700 font-bold text-[11px] whitespace-nowrap">บาท/ชม.</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-emerald-700 mt-1">
                    <span>~{(rnOtRate * 8).toLocaleString()} บ./เวร (8 ชม.)</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {[80, 100, 120, 150].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRnOtRate(r)}
                        className={`px-1.5 py-0.5 text-[10px] rounded border font-semibold cursor-pointer ${
                          rnOtRate === r
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-emerald-50"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* PN Column */}
            <div className="p-4 bg-sky-50/50 border border-sky-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-sky-200 pb-2">
                <div className="flex items-center gap-2 font-bold text-sky-950 text-xs">
                  <span className="px-2 py-0.5 bg-sky-600 text-white rounded-md text-[10px] font-bold">PN</span>
                  <span>พยาบาลเทคนิค / ผู้ช่วย (Practical Nurse)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ค่าเวรบ่าย-ดึก (บด):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={pnEveNightRate}
                      onChange={(e) => setPnEveNightRate(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs font-bold text-slate-800 bg-white border border-sky-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <span className="text-slate-500 text-[11px] whitespace-nowrap font-medium">บาท/เวร</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ค่าล่วงเวลา (OT):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={pnOtRate}
                      onChange={(e) => setPnOtRate(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs font-bold text-slate-800 bg-white border border-sky-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <span className="text-sky-700 font-bold text-[11px] whitespace-nowrap">บาท/ชม.</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-sky-700 mt-1">
                    <span>~{(pnOtRate * 8).toLocaleString()} บ./เวร (8 ชม.)</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {[60, 75, 90, 100].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setPnOtRate(r)}
                        className={`px-1.5 py-0.5 text-[10px] rounded border font-semibold cursor-pointer ${
                          pnOtRate === r
                            ? "bg-sky-600 text-white border-sky-600"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-sky-50"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Formula Explanation Box */}
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl text-xs space-y-2 text-amber-950">
            <div className="flex items-center gap-1.5 font-bold">
              <InformationCircleIcon className="w-4 h-4 text-amber-600" />
              <span>สูตรการคำนวณค่าเวร & ค่าล่วงเวลา (OT):</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-amber-800 pl-1">
              <div>• <strong>ค่าเวร:</strong> บ/ด × ค่าเวรบ่าย-ดึก (บ/ด) (แยกตาม RN, PN)</div>
              <div>• <strong>OT (เวร):</strong> (ช + บ + ด) - (จำนวนวันทำการ)</div>
              <div>• <strong>เงิน OT:</strong> OT × 8 × ค่าเวรล่วงเวลา (OT ต่อชั่วโมง) (แยกตาม RN, PN)</div>
              <div>• <strong>รวมเงินสุทธิ:</strong> ค่าเวร (บ/ด) + เงิน OT</div>
              <div>• <strong>การนับหน่วย บ/ด:</strong> บ (1.0), ด (1.0), Day 12h (0.5), Night 12h (1.5), ชบ (1.0), บด (2.0)</div>
              <div>• <strong>เพดานสิทธิเบิก:</strong> {allowanceCap > 0 ? `จำกัดสิทธิเบิกค่าเวรสูงสุดไม่เกิน ${allowanceCap} หน่วย/เดือน` : "เบิกได้ตามจริงไม่จำกัดเพดาน"}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition shadow-2xs"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            {busy ? "กำลังบันทึก..." : "💾 บันทึกการตั้งค่า"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
