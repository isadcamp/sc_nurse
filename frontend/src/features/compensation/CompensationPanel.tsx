"use client";

import { useState } from "react";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  SparklesIcon,
  InformationCircleIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { request } from "@/lib/api";
import type { Roster, RosterResponse } from "@/types/schedule";

interface CompensationPanelProps {
  roster: Roster;
  token: string;
  onSaved: (updated: RosterResponse) => void;
  onBackToGrid: () => void;
}

export function CompensationPanel({
  roster,
  token,
  onSaved,
  onBackToGrid,
}: CompensationPanelProps) {
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
  const [notice, setNotice] = useState("");

  const baseHours = workingDays * 8;

  async function handleSave() {
    setBusy(true);
    setError("");
    setNotice("");
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
      setNotice("บันทึกการตั้งค่านโยบายค่าตอบแทน & OT เรียบร้อยแล้ว");
      onSaved(updated);
      setTimeout(() => {
        onBackToGrid();
      }, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToGrid}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-2xs flex items-center gap-1 text-xs font-bold"
            title="กลับสู่หน้าตารางเวร"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">กลับสู่ตารางเวร</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <h2 className="text-lg font-bold text-slate-800">
                ตั้งค่าวันทำการ & ค่าตอบแทนเวร/OT ประจำเดือน — {roster.wardId}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              กำหนดเกณฑ์วันทำการปกติ, เรทค่าเวรบ่าย-ดึก (บด), ค่า OT และเพดานสิทธิเบิกประจำเดือน {roster.month}/{roster.year}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก..." : "💾 บันทึกการตั้งค่า"}
          </button>
        </div>
      </div>

      {/* Notice & Error */}
      {notice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice("")} className="text-emerald-600 hover:text-emerald-900 font-bold px-1">✕</button>
        </div>
      )}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <InformationCircleIcon className="w-5 h-5 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900 font-bold px-1">✕</button>
        </div>
      )}

      {/* Grid Settings Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Monthly Working Days Configuration */}
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
              <CalendarDaysIcon className="w-5 h-5 text-indigo-600" />
              <span>เกณฑ์วันทำการประจำเดือน (Working Days Base)</span>
            </div>
            <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2.5 py-0.5 rounded-full">
              เดือน {roster.month}/{roster.year}
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            ใช้เป็นฐานคิดชั่วโมงเวรปกติ โดยชั่วโมงทำงานของพยาบาลที่เกินเกณฑ์นี้จะถูกคำนวณเป็น <strong>เวร OT</strong> อัตโนมัติ
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2.5">
                <label className="text-xs font-bold text-slate-700">จำนวนวันทำการ:</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={workingDays}
                  onChange={(e) => setWorkingDays(Math.max(1, Number(e.target.value)))}
                  className="w-20 px-3 py-2 text-xs font-black text-slate-800 bg-slate-50 border border-slate-300 rounded-xl text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-slate-600 font-semibold">วัน</span>
              </div>

              <div className="text-xs text-slate-600 bg-indigo-50/70 px-3 py-1.5 rounded-xl border border-indigo-100 font-semibold">
                = <span className="font-black text-indigo-700">{baseHours}</span> ชม. ปกติ ({workingDays} เวร)
              </div>
            </div>

            {/* Quick preset buttons */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-slate-400 font-semibold">ตัวเลือกลัด:</span>
              {[20, 21, 22, 23].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWorkingDays(d)}
                  className={`px-3 py-1 text-xs rounded-xl border transition font-bold cursor-pointer ${
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

        {/* 2. Monthly Allowance Cap */}
        <div className="p-6 bg-purple-50/50 border border-purple-200 rounded-3xl space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-purple-200/80 pb-3">
            <div className="flex items-center gap-2 font-bold text-purple-950 text-sm">
              <ShieldCheckIcon className="w-5 h-5 text-purple-600" />
              <span>เพดานสิทธิเบิกค่าเวร บด (Allowance Cap)</span>
            </div>
            <span className="text-xs bg-purple-100 text-purple-800 font-bold px-2.5 py-0.5 rounded-full">
              {allowanceCap > 0 ? `จำกัด ${allowanceCap} เวร` : "ไม่จำกัด"}
            </span>
          </div>

          <p className="text-xs text-purple-800/80 leading-relaxed">
            กำหนดจำนวนเวรบ่าย-ดึก (บด) สูงสุดที่สามารถเบิกจ่ายได้ต่อคนต่อเดือน (หากตั้งค่าเป็น 0 หมายถึงเบิกได้ตามที่ขึ้นจริงไม่จำกัดเพดาน)
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-purple-200">
              <div className="flex items-center gap-2.5">
                <label className="text-xs font-bold text-purple-950">เพดานเบิกสูงสุด:</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={allowanceCap}
                  onChange={(e) => setAllowanceCap(Math.max(0, Number(e.target.value)))}
                  className="w-20 px-3 py-2 text-xs font-black text-slate-800 bg-purple-50/50 border border-purple-300 rounded-xl text-center focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
                <span className="text-xs text-purple-900 font-semibold">เวร / คน / เดือน</span>
              </div>

              <div className="text-xs text-purple-900 bg-purple-100/70 px-3 py-1.5 rounded-xl font-bold">
                {allowanceCap > 0 ? `สูงสุด ${allowanceCap} เวร` : "ไม่จำกัดเพดาน"}
              </div>
            </div>

            {/* Quick preset buttons */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-purple-400 font-semibold">ตัวเลือกลัด:</span>
              {[0, 15, 18, 20].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAllowanceCap(c)}
                  className={`px-3 py-1 text-xs rounded-xl border transition font-bold cursor-pointer ${
                    allowanceCap === c
                      ? "bg-purple-700 text-white border-purple-700 shadow-xs"
                      : "bg-white text-purple-900 border-purple-200 hover:bg-purple-50"
                  }`}
                >
                  {c === 0 ? "ไม่จำกัด (0)" : `${c} เวร`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Rates Configuration: Separate RN and PN */}
      <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <BanknotesIcon className="w-5 h-5 text-emerald-600" />
            <span>อัตราค่าตอบแทนต่อเวร 8 ชม. (Compensation Rates per 8h Shift)</span>
          </div>
          <span className="text-xs text-slate-500">แยกตั้งค่าตามตำแหน่งวิชาชีพ RN / PN</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* RN Rates Card */}
          <div className="p-5 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-blue-200/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-black bg-blue-600 text-white">RN</span>
                <span className="font-bold text-blue-950 text-xs">พยาบาลวิชาชีพ (Registered Nurse)</span>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-blue-200">
                <div>
                  <div className="text-xs font-bold text-slate-800">ค่าเวรบ่าย-ดึก (บ/ด)</div>
                  <div className="text-[10px] text-slate-500">Evening/Night shift allowance</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={rnEveNightRate}
                    onChange={(e) => setRnEveNightRate(Number(e.target.value))}
                    className="w-24 px-3 py-1.5 text-xs font-black text-right text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-600 font-bold">฿ / เวร</span>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">ค่าเวรล่วงเวลา (OT ต่อชั่วโมง)</div>
                    <div className="text-[10px] text-slate-500">Overtime pay rate per hour</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={rnOtRate}
                      onChange={(e) => setRnOtRate(Number(e.target.value))}
                      className="w-24 px-3 py-1.5 text-xs font-black text-right text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-blue-700 font-bold">฿ / ชม.</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-blue-700 pt-1 border-t border-slate-100">
                  <span>~{(rnOtRate * 8).toLocaleString()} บาท/เวร (8 ชม.)</span>
                  <div className="flex items-center gap-1">
                    {[80, 100, 120, 150].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRnOtRate(r)}
                        className={`px-1.5 py-0.5 text-[10px] rounded border font-semibold cursor-pointer ${
                          rnOtRate === r
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50"
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

          {/* PN Rates Card */}
          <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-600 text-white">PN</span>
                <span className="font-bold text-emerald-950 text-xs">ผู้ช่วยพยาบาล (Practical Nurse)</span>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-emerald-200">
                <div>
                  <div className="text-xs font-bold text-slate-800">ค่าเวรบ่าย-ดึก (บ/ด)</div>
                  <div className="text-[10px] text-slate-500">Evening/Night shift allowance</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={pnEveNightRate}
                    onChange={(e) => setPnEveNightRate(Number(e.target.value))}
                    className="w-24 px-3 py-1.5 text-xs font-black text-right text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-600 font-bold">฿ / เวร</span>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">ค่าเวรล่วงเวลา (OT ต่อชั่วโมง)</div>
                    <div className="text-[10px] text-slate-500">Overtime pay rate per hour</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={pnOtRate}
                      onChange={(e) => setPnOtRate(Number(e.target.value))}
                      className="w-24 px-3 py-1.5 text-xs font-black text-right text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-emerald-700 font-bold">฿ / ชม.</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-emerald-700 pt-1 border-t border-slate-100">
                  <span>~{(pnOtRate * 8).toLocaleString()} บาท/เวร (8 ชม.)</span>
                  <div className="flex items-center gap-1">
                    {[60, 75, 90, 100].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setPnOtRate(r)}
                        className={`px-1.5 py-0.5 text-[10px] rounded border font-semibold cursor-pointer ${
                          pnOtRate === r
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

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onBackToGrid}
          className="px-5 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs"
        >
          กลับสู่ตารางเวร
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-600/20 disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "💾 บันทึกการตั้งค่า"}
        </button>
      </div>
    </div>
  );
}
