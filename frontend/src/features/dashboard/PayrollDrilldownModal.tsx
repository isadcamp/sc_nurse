"use client";
import React, { useMemo } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import {
  PrinterIcon,
  XMarkIcon,
  CalendarDaysIcon,
  UserCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { Roster, Staff, Cell } from "@/types/schedule";

interface PayrollDrilldownModalProps {
  roster: Roster;
  nurse: Staff | null;
  isOpen: boolean;
  onClose: () => void;
}

const thaiDayNames = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const thaiMonths = [
  "",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export function PayrollDrilldownModal({
  roster,
  nurse,
  isOpen,
  onClose,
}: PayrollDrilldownModalProps) {
  const comp = roster?.policy?.compensation || {};
  const isPN = /PN|PRACTICAL|ผู้ช่วย/i.test(nurse?.position || "");
  const eveRate = isPN
    ? (comp.pnEveNightRate !== undefined ? comp.pnEveNightRate : 180)
    : (comp.rnEveNightRate !== undefined ? comp.rnEveNightRate : 240);
  const rawOtRate = isPN
    ? (comp.pnOtRate !== undefined ? comp.pnOtRate : 75)
    : (comp.rnOtRate !== undefined ? comp.rnOtRate : 100);
  const otHourlyRate = rawOtRate > 250 ? Math.round(rawOtRate / 8) : rawOtRate;
  const allowanceCap = comp.allowanceCap ?? 0;
  const workingDays = comp.workingDays && comp.workingDays > 0 ? comp.workingDays : 22;

  const monthName = thaiMonths[roster?.month || 9] || "";
  const buddhistYear = (roster?.year || 2026) + 543;

  // Compute daily statement rows
  const statement = useMemo(() => {
    if (!nurse || !roster) return null;

    const year = roster.year || 2026;
    const month = roster.month || 9;
    const daysInMonth = new Date(year, month, 0).getDate();

    const standardHours = workingDays * 8;

    const cellMap = new Map<string, Cell>();
    for (const c of roster.assignments || []) {
      if (c.nurseId === nurse.id) {
        cellMap.set(c.date, c);
      }
    }

    const rows = [];
    let totalWorkHours = 0;
    let totalLeaveCreditHours = 0;
    let totalEveNightUnits = 0;
    let morningCount = 0;
    let eveningCount = 0;
    let nightCount = 0;
    let offCount = 0;
    let leaveCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dateObj = new Date(year, month - 1, d);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const cell = cellMap.get(dateStr);
      const code = cell?.shiftCode?.trim() || "";

      let workHours = 0;
      let leaveCredit = 0;
      let eveNightUnit = 0;
      let shiftLabel = "—";
      let shiftColor = "text-slate-400 bg-slate-50";

      if (code === "ช") {
        workHours = 8;
        morningCount++;
        shiftLabel = "เช้า (08:00-16:00)";
        shiftColor = "text-amber-800 bg-amber-50 border-amber-200";
      } else if (code === "อบ") {
        workHours = 8;
        shiftLabel = "อบรม/ประชุมวิชาการ (8 ชม.)";
        shiftColor = "text-indigo-950 bg-indigo-100 border-indigo-300";
      } else if (code === "บห") {
        workHours = 8;
        shiftLabel = "งานบริหาร/ภารกิจพิเศษ (8 ชม.)";
        shiftColor = "text-cyan-950 bg-cyan-100 border-cyan-300";
      } else if (code === "Day" || code === "D") {
        workHours = 12;
        eveNightUnit = 0.5;
        morningCount++;
        shiftLabel = "Day 12h (08:00-20:00)";
        shiftColor = "text-amber-900 bg-amber-100 border-amber-300";
      } else if (code === "บ") {
        workHours = 8;
        eveNightUnit = 1.0;
        eveningCount++;
        shiftLabel = "บ่าย (16:00-24:00)";
        shiftColor = "text-orange-800 bg-orange-50 border-orange-200";
      } else if (code === "ด") {
        workHours = 8;
        eveNightUnit = 1.0;
        nightCount++;
        shiftLabel = "ดึก (24:00-08:00)";
        shiftColor = "text-indigo-800 bg-indigo-50 border-indigo-200";
      } else if (code === "Night" || code === "N") {
        workHours = 12;
        eveNightUnit = 1.5;
        nightCount++;
        shiftLabel = "Night 12h (20:00-08:00)";
        shiftColor = "text-indigo-900 bg-indigo-100 border-indigo-300";
      } else if (code === "ชบ") {
        workHours = 16;
        eveNightUnit = 1.0;
        morningCount++;
        eveningCount++;
        shiftLabel = "เช้า-บ่าย (16h)";
        shiftColor = "text-rose-800 bg-rose-50 border-rose-200";
      } else if (code === "บด") {
        workHours = 16;
        eveNightUnit = 2.0;
        eveningCount++;
        nightCount++;
        shiftLabel = "บ่าย-ดึก (16h)";
        shiftColor = "text-purple-800 bg-purple-50 border-purple-200";
      } else if (code === "V" || code === "v" || code === "Va" || code === "L") {
        leaveCredit = 8;
        leaveCount++;
        shiftLabel = (code === "V" || code === "v") ? "ลาพักร้อน (8h Credit)" : code === "Va" ? "ลาพักผ่อน (8h Credit)" : "ลาป่วย/กิจ (8h Credit)";
        shiftColor = "text-purple-900 bg-purple-100 border-purple-300";
      } else if (code === "X" || code === "x" || code === "อ") {
        offCount++;
        shiftLabel = "วันหยุด (Off)";
        shiftColor = "text-slate-600 bg-slate-100 border-slate-200";
      }

      totalWorkHours += workHours;
      totalLeaveCreditHours += leaveCredit;
      totalEveNightUnits += eveNightUnit;

      rows.push({
        day: d,
        dateStr,
        dayOfWeekName: thaiDayNames[dayOfWeek],
        isWeekend,
        shiftCode: code,
        shiftLabel,
        shiftColor,
        workHours,
        leaveCredit,
        eveNightUnit,
        dailyEveNightPay: eveNightUnit * eveRate,
        cumulativeCredit: totalWorkHours + totalLeaveCreditHours,
      });
    }

    const totalCreditHours = totalWorkHours + totalLeaveCreditHours;
    const variance = totalCreditHours - standardHours;
    const otHours = Math.max(0, variance);
    const shortageHours = Math.max(0, -variance);
    const otShifts = otHours / 8;

    const payableUnits = allowanceCap > 0 ? Math.min(totalEveNightUnits, allowanceCap) : totalEveNightUnits;
    const excessUnits = allowanceCap > 0 ? Math.max(0, totalEveNightUnits - allowanceCap) : 0;

    const totalEveNightPay = payableUnits * eveRate;
    const totalOtPay = otHours * otHourlyRate;
    const grandTotalPay = totalEveNightPay + totalOtPay;

    return {
      standardHours,
      totalWorkHours,
      totalLeaveCreditHours,
      totalCreditHours,
      variance,
      otHours,
      shortageHours,
      otShifts,
      totalEveNightUnits,
      payableUnits,
      excessUnits,
      totalEveNightPay,
      totalOtPay,
      grandTotalPay,
      morningCount,
      eveningCount,
      nightCount,
      offCount,
      leaveCount,
      rows,
    };
  }, [nurse, roster, eveRate, otHourlyRate, allowanceCap, workingDays]);

  if (!isOpen || !nurse || !statement) return null;

  function handlePrint() {
    window.print();
  }

  return (
    <ModalFrame title="เอกสารแจกแจงรายได้รายบุคคล (Payroll Statement)" onClose={onClose} className="max-w-4xl max-h-[92vh] overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black text-xl shadow-md">
              <UserCircleIcon className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">{nurse.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">
                  {nurse.position || "RN"}
                </span>
                {nurse.leader && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    หัวหน้าเวร
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                รหัสเจ้าหน้าที่: <strong className="text-slate-700">{nurse.id}</strong> | แผนก: <strong className="text-slate-700">{roster.wardId}</strong> | ประจำงวด: <strong className="text-teal-700">{monthName} {buddhistYear}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-300 shadow-xs"
            >
              <PrinterIcon className="w-4 h-4" />
              พิมพ์ใบสรุป
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Summary Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500">ชั่วโมงทำงานจริง + ลา</div>
            <div className="text-lg font-black text-slate-800 mt-0.5">
              {statement.totalCreditHours} <span className="text-xs font-normal text-slate-500">ชม.</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              (ทำงาน {statement.totalWorkHours}h + ลา {statement.totalLeaveCreditHours}h)
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200">
            <div className="text-[11px] font-semibold text-purple-700">ชั่วโมงล่วงเวลา (OT)</div>
            <div className="text-lg font-black text-purple-900 mt-0.5">
              {statement.otHours} <span className="text-xs font-normal text-purple-700">ชม. ({statement.otShifts.toFixed(2)} เวร)</span>
            </div>
            <div className="text-[10px] text-purple-600 mt-0.5">
              อัตรา @ {otHourlyRate} ฿/ชม. = {statement.totalOtPay.toLocaleString()} ฿
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-[11px] font-semibold text-amber-800">เวรบ่าย-ดึก (เบิกได้)</div>
            <div className="text-lg font-black text-amber-900 mt-0.5">
              {statement.payableUnits} <span className="text-xs font-normal text-amber-700">หน่วย</span>
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5">
              {statement.excessUnits > 0 ? `คำนวณ ${statement.totalEveNightUnits} (เกินสิทธิ ${statement.excessUnits})` : `อัตรา @ ${eveRate} ฿/หน่วย`}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300">
            <div className="text-[11px] font-bold text-emerald-800">รวมรับสุทธิ (Net Total)</div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">
              {statement.grandTotalPay.toLocaleString()} <span className="text-xs font-bold text-emerald-600">฿</span>
            </div>
            <div className="text-[10px] text-emerald-600 mt-0.5">
              บด {statement.totalEveNightPay.toLocaleString()} + OT {statement.totalOtPay.toLocaleString()} ฿
            </div>
          </div>
        </div>

        {/* Daily Breakdown Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <CalendarDaysIcon className="w-4 h-4 text-slate-500" />
              ตารางแจกแจงรายวัน (Daily Itemized Statement)
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              อัตราค่าตอบแทน: {nurse.position || "RN"} (บ่ายดึก {eveRate} ฿/หน่วย | OT {otHourlyRate} ฿/ชม.)
            </span>
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-2.5 text-center w-12 font-bold">วันที่</th>
                  <th className="p-2.5 font-bold">วันในสัปดาห์</th>
                  <th className="p-2.5 font-bold">เวรปฏิบัติงาน</th>
                  <th className="p-2.5 text-center font-bold">ชม. งาน</th>
                  <th className="p-2.5 text-center font-bold">เครดิตลา</th>
                  <th className="p-2.5 text-center font-bold">หน่วย บด</th>
                  <th className="p-2.5 text-right font-bold">ค่าเวร บด (฿)</th>
                  <th className="p-2.5 text-right font-bold">ชม. สะสม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statement.rows.map((r) => (
                  <tr
                    key={r.day}
                    className={`hover:bg-teal-50/40 transition ${
                      r.isWeekend ? "bg-slate-50/50" : ""
                    }`}
                  >
                    <td className="p-2 text-center font-bold text-slate-700">{r.day}</td>
                    <td className="p-2 text-slate-600">
                      <span className={r.isWeekend ? "font-bold text-rose-600" : "text-slate-600"}>
                        {r.dayOfWeekName}
                      </span>
                    </td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${r.shiftColor}`}>
                        {r.shiftCode || "—"} : {r.shiftLabel}
                      </span>
                    </td>
                    <td className="p-2 text-center font-semibold text-slate-700">
                      {r.workHours > 0 ? `${r.workHours} ชม.` : "—"}
                    </td>
                    <td className="p-2 text-center font-semibold text-purple-700">
                      {r.leaveCredit > 0 ? `${r.leaveCredit} ชม.` : "—"}
                    </td>
                    <td className="p-2 text-center font-bold text-amber-800">
                      {r.eveNightUnit > 0 ? r.eveNightUnit : "—"}
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-800">
                      {r.dailyEveNightPay > 0 ? `${r.dailyEveNightPay.toLocaleString()} ฿` : "—"}
                    </td>
                    <td className="p-2 text-right font-bold text-slate-800">
                      {r.cumulativeCredit} ชม.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Audit & Certification Note */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 space-y-2">
          <div className="flex items-center gap-2 text-slate-700 font-bold">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
            การรับรองความถูกต้องของข้อมูล (Audit & Certification)
          </div>
          <p className="text-[11px] leading-relaxed">
            รายการคำนวณนี้ออกโดยระบบ <strong>เวรEasy Payroll Engine</strong> คำนวณตามระเบียบโรงพยาบาล:
            ฐานทำงาน {workingDays} วันทำการ ({statement.standardHours} ชม.), อัตราค่าเวรบ่ายดึก {eveRate} ฿/หน่วย (เพดาน {allowanceCap > 0 ? `${allowanceCap} วัน` : "ไม่จำกัด"}), และอัตราค่าล่วงเวลา OT {otHourlyRate} ฿/ชม. (~{(otHourlyRate * 8).toLocaleString()} ฿/เวร 8 ชม.)
          </p>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
