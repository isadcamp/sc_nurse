"use client";

import { useState, useMemo } from "react";
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { request } from "@/lib/api";
import { ShiftBadge } from "@/components/schedule/ShiftBadge";
import type { Roster, RosterResponse } from "@/types/schedule";

interface BoundaryPanelProps {
  roster: Roster;
  token: string;
  onSaved: (updated: RosterResponse) => void;
  onBackToGrid: () => void;
}

export function BoundaryPanel({ roster, token, onSaved, onBackToGrid }: BoundaryPanelProps) {
  // Preceding date: the last day of the previous month
  const precedingDate = useMemo(() => {
    const d = new Date(Date.UTC(roster.year, roster.month - 1, 0));
    return d.toISOString().split("T")[0];
  }, [roster.year, roster.month]);

  const thaiDateLabel = useMemo(() => {
    try {
      const [y, m, d] = precedingDate.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });
    } catch {
      return precedingDate;
    }
  }, [precedingDate]);

  // Available shifts for this ward
  const availableShifts = useMemo(() => {
    const set = new Set<string>(["X", "ช", "บ", "ด", "ชบ", "บด", "D", "N", "V"]);
    if (roster.shifts) {
      for (const s of roster.shifts) {
        const code = s.code?.trim();
        if (code && code !== "?" && code !== "??" && code !== "???") {
          set.add(code);
        }
      }
    }
    return Array.from(set);
  }, [roster.shifts]);

  // Initial shifts mapped from existing boundary data or defaulted to "X"
  const [shifts, setShifts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    const activeStaff = roster.staff.filter((n) => n.active);
    for (const n of activeStaff) {
      const found = roster.boundary?.find((b) => b.nurseId === n.id && b.date === precedingDate);
      map[n.id] = found?.shiftCode || "X";
    }
    return map;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeStaff = roster.staff.filter((n) => n.active);

  function handleQuickSetAll(shiftCode: string) {
    const updated: Record<string, string> = {};
    for (const n of activeStaff) {
      updated[n.id] = shiftCode;
    }
    setShifts(updated);
  }

  async function handleSave() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/boundary-shifts`, token, "POST", {
        date: precedingDate,
        shifts,
      });
      setSuccess("บันทึกเวรวันก่อนหน้าเรียบร้อยแล้ว");
      onSaved(res);
      setTimeout(() => {
        onBackToGrid();
      }, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกเวรวันก่อนหน้าไม่สำเร็จ");
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
              <span className="text-xl">🌓</span>
              <h2 className="text-lg font-bold text-slate-800">
                กรอกเวรวันก่อนหน้า (รอยต่อเดือน) — แผนก: {roster.wardId}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ระบุเวรของวันสุดท้ายของเดือนก่อนหน้า เพื่อใช้ตรวจการพักผ่อน (ดึกต่อเช้า) และวันทำงานต่อเนื่อง
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-teal-600/20 disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก..." : "💾 บันทึกเวรวันก่อนหน้า"}
          </button>
        </div>
      </div>

      {/* Notice & Error */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircleIcon className="w-5 h-5 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900 font-bold px-1">✕</button>
        </div>
      )}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess("")} className="text-emerald-600 hover:text-emerald-900 font-bold px-1">✕</button>
        </div>
      )}

      {/* Preceding Date Banner & Quick Set Actions */}
      <div className="p-5 bg-gradient-to-r from-teal-50/80 via-blue-50/60 to-indigo-50/50 border border-teal-200/80 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div>
          <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wide">
            วันสุดท้ายของเดือนก่อนหน้า (Preceding Date):
          </span>
          <div className="text-base font-black text-slate-800 mt-0.5">
            {thaiDateLabel} <span className="text-xs text-slate-500 font-mono">({precedingDate})</span>
          </div>
        </div>

        {/* Quick Batch Set Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-600 mr-1">ตั้งค่าด่วนทุกคน:</span>
          <button
            type="button"
            onClick={() => handleQuickSetAll("X")}
            className="px-3.5 py-1.5 text-xs bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold transition shadow-2xs cursor-pointer"
          >
            ⚡ ทุกคน X (หยุด)
          </button>
          <button
            type="button"
            onClick={() => handleQuickSetAll("ช")}
            className="px-3.5 py-1.5 text-xs bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-xl font-bold transition shadow-2xs cursor-pointer"
          >
            ⚡ ทุกคนเวรเช้า (ช)
          </button>
          <button
            type="button"
            onClick={() => handleQuickSetAll("บ")}
            className="px-3.5 py-1.5 text-xs bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 rounded-xl font-bold transition shadow-2xs cursor-pointer"
          >
            ⚡ ทุกคนเวรบ่าย (บ)
          </button>
          <button
            type="button"
            onClick={() => handleQuickSetAll("ด")}
            className="px-3.5 py-1.5 text-xs bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded-xl font-bold transition shadow-2xs cursor-pointer"
          >
            ⚡ ทุกคนเวรดึก (ด)
          </button>
        </div>
      </div>

      {/* Staff Grid */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-800">
            รายชื่อพยาบาลในหน่วยงาน ({activeStaff.length} คน)
          </h3>
          <span className="text-xs text-slate-500">เลือกเวรที่ปฏิบัติงานในวันสุดท้ายของเดือนก่อนหน้า</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {activeStaff.map((nurse, idx) => {
            const currentShift = shifts[nurse.id] || "X";
            const isRN = nurse.position === "RN";

            return (
              <div
                key={nurse.id}
                className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-teal-300 hover:shadow-xs transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-5 text-center">{idx + 1}</span>
                    <div>
                      <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                        <span>{nurse.name}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                            isRN
                              ? "bg-blue-100 text-blue-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {nurse.position || "RN"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{nurse.id}</div>
                    </div>
                  </div>

                  <ShiftBadge shiftCode={currentShift} />
                </div>

                {/* Quick Selection Buttons */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                  {availableShifts.map((code, cIdx) => {
                    const isSelected = currentShift === code;
                    return (
                      <button
                        type="button"
                        key={`${code}_${cIdx}`}
                        onClick={() => setShifts((prev) => ({ ...prev, [nurse.id]: code }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          isSelected
                            ? "bg-teal-600 text-white shadow-xs"
                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
          className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-teal-600/20 disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "💾 บันทึกเวรวันก่อนหน้า"}
        </button>
      </div>
    </div>
  );
}
