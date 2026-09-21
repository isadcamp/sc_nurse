"use client";
import { useState, useMemo } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { CalendarDaysIcon, XMarkIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { request } from "@/lib/api";
import { ShiftBadge } from "@/components/schedule/ShiftBadge";
import type { Roster, RosterResponse } from "@/types/schedule";

interface BoundaryModalProps {
  open: boolean;
  onClose: () => void;
  roster: Roster;
  token: string;
  onSaved: (updated: RosterResponse) => void;
}

export function BoundaryModal({ open, onClose, roster, token, onSaved }: BoundaryModalProps) {
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
    const list = roster.shifts.map((s) => s.code);
    if (!list.includes("X")) list.unshift("X");
    return list;
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

  if (!open) return null;

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
      setTimeout(() => {
        onSaved(res);
        onClose();
      }, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกเวรวันก่อนหน้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalFrame title="เวรวันก่อนหน้า (รอยต่อเดือน)" onClose={onClose}>
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-[92vw] md:w-[66.67vw] max-w-6xl h-[75vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600/30 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <CalendarDaysIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                กรอกเวรวันก่อนหน้า (รอยต่อเดือน) — แผนก: {roster.wardId}
              </h3>
              <p className="text-xs text-slate-400">
                ระบุเวรของวันสุดท้ายของเดือนก่อนหน้า เพื่อใช้ตรวจการพักผ่อน (ดึกต่อเช้า) และวันทำงานต่อเนื่อง
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="text-slate-400 hover:text-white transition p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold flex items-center gap-2">
              <CheckCircleIcon className="h-4 w-4" />
              <span>{success}</span>
            </div>
          )}

          {/* Date info banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-teal-50/70 border border-teal-200/80 rounded-2xl p-4">
            <div>
              <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wide">
                วันสุดท้ายของเดือนก่อนหน้า:
              </span>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                {thaiDateLabel} ({precedingDate})
              </div>
            </div>
            {/* Quick Set buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-600 mr-1">ตั้งค่าด่วนทุกคน:</span>
              <button
                type="button"
                onClick={() => handleQuickSetAll("X")}
                className="px-3 py-1.5 text-xs bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold transition shadow-2xs cursor-pointer"
              >
                ⚡ ทุกคน X (หยุด)
              </button>
              <button
                type="button"
                onClick={() => handleQuickSetAll("ช")}
                className="px-3 py-1.5 text-xs bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-xl font-bold transition shadow-2xs cursor-pointer"
              >
                ⚡ ทุกคนเวรเช้า (ช)
              </button>
              <button
                type="button"
                onClick={() => handleQuickSetAll("บ")}
                className="px-3 py-1.5 text-xs bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 rounded-xl font-bold transition shadow-2xs cursor-pointer"
              >
                ⚡ ทุกคนเวรบ่าย (บ)
              </button>
              <button
                type="button"
                onClick={() => handleQuickSetAll("ด")}
                className="px-3 py-1.5 text-xs bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded-xl font-bold transition shadow-2xs cursor-pointer"
              >
                ⚡ ทุกคนเวรดึก (ด)
              </button>
            </div>
          </div>

          {/* Staff Shift Grid */}
          <fieldset className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
            <legend className="text-xs font-bold text-slate-800 px-2 flex items-center gap-1.5">
              <span>👥</span> ข้อมูลการขึ้นเวรของเจ้าหน้าที่ ({activeStaff.length} คน)
            </legend>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[42vh] overflow-y-auto pr-1">
              {activeStaff.map((nurse, index) => {
                const currentShift = shifts[nurse.id] || "X";
                return (
                  <div
                    key={nurse.id}
                    className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-teal-300 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {nurse.name}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 font-semibold">
                            {nurse.position}
                          </span>
                          <span className="font-mono text-slate-400">ID: {nurse.id}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        aria-label={`เวรวันก่อนหน้าของ ${nurse.name}`}
                        value={currentShift}
                        onChange={(e) =>
                          setShifts((prev) => ({
                            ...prev,
                            [nurse.id]: e.target.value,
                          }))
                        }
                        disabled={busy}
                        className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {availableShifts.map((code) => {
                          const shiftObj = roster.shifts.find((s) => s.code === code);
                          return (
                            <option key={code} value={code}>
                              {code} {shiftObj?.name ? `(${shiftObj.name.split(" ")[0]})` : ""}
                            </option>
                          );
                        })}
                      </select>
                      <ShiftBadge shiftCode={currentShift} />
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-teal-600/20 cursor-pointer"
          >
            {busy ? "กำลังบันทึก..." : "💾 บันทึกเวรวันก่อนหน้า"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
