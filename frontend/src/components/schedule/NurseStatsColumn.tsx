"use client";
import React from "react";
import { Cell } from "@/types/schedule";

interface NurseStatsColumnProps {
  nurseId: string;
  position?: string;
  assignments: Cell[];
  targetHours?: number;
  compensation?: {
    workingDays?: number;
    allowanceCap?: number;
    rnEveNightRate?: number;
    pnEveNightRate?: number;
    rnOtRate?: number;
    pnOtRate?: number;
  };
  onDrilldown?: () => void;
}

export function NurseStatsColumn({
  nurseId,
  position = "RN",
  assignments,
  targetHours = 0,
  compensation,
  onDrilldown,
}: NurseStatsColumnProps) {
  let morning = 0;
  let evening = 0;
  let night = 0;
  let leave = 0;
  let actualWorkHours = 0;
  let calculatedEveNightShifts = 0;

  for (const a of assignments) {
    if (a.nurseId === nurseId) {
      const code = a.shiftCode?.trim();
      if (code === "ช") {
        morning++;
        actualWorkHours += 8;
      } else if (code === "Day" || code === "D") {
        morning++;
        actualWorkHours += 12;
        // 12-hour Day shift gets 0.5 afternoon allowance unit
        calculatedEveNightShifts += 0.5;
      } else if (code === "บ") {
        evening++;
        actualWorkHours += 8;
        calculatedEveNightShifts += 1.0;
      } else if (code === "ด") {
        night++;
        actualWorkHours += 8;
        calculatedEveNightShifts += 1.0;
      } else if (code === "Night" || code === "N") {
        night++;
        actualWorkHours += 12;
        // 12-hour Night shift gets 1.5 allowance units (0.5 eve + 1.0 night)
        calculatedEveNightShifts += 1.5;
      } else if (code === "ชบ") {
        morning++;
        evening++;
        actualWorkHours += 16;
        calculatedEveNightShifts += 1.0;
      } else if (code === "บด") {
        night++;
        evening++;
        actualWorkHours += 16;
        calculatedEveNightShifts += 2.0;
      } else if (code === "ชด") {
        morning++;
        night++;
        actualWorkHours += 16;
        calculatedEveNightShifts += 1.0;
      } else if (code === "อ" || code === "X" || code === "x") {
        // Day off
      } else if (code === "L" || code === "Va" || code === "V" || code === "v") {
        leave++;
      }
    }
  }

  // Monthly working days baseline
  const workingDays = compensation?.workingDays && compensation.workingDays > 0 ? compensation.workingDays : 22;
  const standardHours = targetHours > 0 ? targetHours : workingDays * 8;
  const leaveCreditHours = leave * 8;
  const creditHours = actualWorkHours + leaveCreditHours;
  const variance = creditHours - standardHours;
  const otHours = Math.max(0, variance);
  const shortageHours = Math.max(0, -variance);
  const otShifts = otHours / 8;

  // Handle Allowance Cap
  const allowanceCap = compensation?.allowanceCap ?? 0;
  const payableEveNightShifts = allowanceCap > 0 ? Math.min(calculatedEveNightShifts, allowanceCap) : calculatedEveNightShifts;
  const excessEveNightShifts = allowanceCap > 0 ? Math.max(0, calculatedEveNightShifts - allowanceCap) : 0;

  // Role-based rates
  const isPN = position.toUpperCase() === "PN";
  const eveRate = isPN ? (compensation?.pnEveNightRate ?? 180) : (compensation?.rnEveNightRate ?? 240);
  const rawOtRate = isPN ? (compensation?.pnOtRate ?? 75) : (compensation?.rnOtRate ?? 100);
  const otHourlyRate = rawOtRate > 250 ? Math.round(rawOtRate / 8) : rawOtRate;

  const eveNightPay = payableEveNightShifts * eveRate;
  const otPay = otHours * otHourlyRate;
  const totalPay = eveNightPay + otPay;

  return (
    <td className="px-3 py-1.5 border-l border-slate-200 text-xs bg-slate-50/70 min-w-[290px]">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Shift Counts Badge */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold" title="เวรเช้า / Day 12h">
              ช:{morning}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 font-bold" title="เวรบ่าย">
              บ:{evening}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold" title="เวรดึก / Night 12h">
              ด:{night}
            </span>
            {leave > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 font-bold" title={`วันลา (${leaveCreditHours} ชม. เครดิต)`}>
                L:{leave}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
            <span title={excessEveNightShifts > 0 ? `คำนวณได้ ${calculatedEveNightShifts} หน่วย (เบิกได้ ${payableEveNightShifts} หน่วย, เกินสิทธิ ${excessEveNightShifts} หน่วย)` : ""}>
              บด: <strong className="text-slate-800">{payableEveNightShifts}</strong> หน่วย
              {excessEveNightShifts > 0 && <span className="text-rose-600 font-bold text-[9px] ml-0.5"> (+{excessEveNightShifts})</span>}
            </span>
            <span>·</span>
            <span title={`ชั่วโมง OT: ${otHours} ชม. @ ${otHourlyRate} ฿/ชม.`}>
              OT: <strong className="text-purple-700">{otHours}</strong> ชม.
            </span>
          </div>
        </div>

        {/* Right: Hours & THB Compensation */}
        <div className="text-right space-y-0.5 min-w-[130px]">
          <div className="flex items-center justify-end gap-1.5">
            <span className="font-black text-slate-800 text-xs" title={`ทำงานจริง ${actualWorkHours} ชม. + ลา ${leaveCreditHours} ชม. = รวมเครดิต ${creditHours} ชม.`}>
              {creditHours} ชม.
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                variance > 0
                  ? "text-purple-700 bg-purple-100"
                  : variance < 0
                  ? "text-rose-700 bg-rose-100"
                  : "text-emerald-700 bg-emerald-100"
              }`}
            >
              {variance > 0 ? `+${otShifts} เวร OT` : variance < 0 ? `ขาด ${shortageHours} ชม.` : "พอดีเกณฑ์"}
            </span>
          </div>

          <button
            type="button"
            onClick={onDrilldown}
            className="text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 px-2 py-0.5 rounded-lg border border-emerald-300 inline-flex items-center gap-1 transition shadow-2xs cursor-pointer group"
            title="คลิกเพื่อดูใบแจกแจงรายได้รายวัน (Daily Statement Drilldown)"
          >
            <span className="text-[9px] text-emerald-600 font-normal">รวม: </span>
            <span>{totalPay.toLocaleString()} ฿</span>
            <span className="text-[9px] text-emerald-500 opacity-0 group-hover:opacity-100 transition">🔍</span>
          </button>

          <div className="text-[9px] text-slate-400">
            (ค่าเวร {eveNightPay.toLocaleString()} + OT {otPay.toLocaleString()})
          </div>
        </div>
      </div>
    </td>
  );
}


