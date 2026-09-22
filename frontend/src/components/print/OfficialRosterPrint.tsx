"use client";
import React, { useState } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { PrinterIcon } from "@heroicons/react/24/outline";
import { Roster } from "@/types/schedule";

interface OfficialRosterPrintProps {
  open: boolean;
  onClose: () => void;
  roster: Roster;
  wardName: string;
}

export function OfficialRosterPrint({
  open,
  onClose,
  roster,
  wardName,
}: OfficialRosterPrintProps) {
  const [printFilter, setPrintFilter] = useState<"all" | "rn" | "pn">("all");

  if (!open) return null;

  const year = roster.year;
  const month = roster.month;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    return `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
  });

  const thaiMonthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const thaiMonth = thaiMonthNames[month - 1] || "";
  const thaiYear = year + 543;

  // Build staff map and shift lookup
  const assignmentsByNurseAndDate: Record<string, string> = {};
  for (const a of roster.assignments) {
    assignmentsByNurseAndDate[`${a.nurseId}_${a.date}`] = a.shiftCode || "";
  }

  // Sort staff: RN first, then PN, then ID/Name
  const sortedStaff = [...roster.staff].sort((a, b) => {
    const posA = (a.position || "").toUpperCase();
    const posB = (b.position || "").toUpperCase();
    if (posA === "RN" && posB !== "RN") return -1;
    if (posA !== "RN" && posB === "RN") return 1;
    if (posA === "PN" && posB !== "PN") return -1;
    if (posA !== "PN" && posB === "PN") return 1;
    const numA = parseInt(a.id.replace(/\D/g, ""), 10);
    const numB = parseInt(b.id.replace(/\D/g, ""), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    const idCmp = a.id.localeCompare(b.id, undefined, { numeric: true });
    if (idCmp !== 0) return idCmp;
    return (a.name || "").localeCompare(b.name || "", "th");
  });

  const rnStaff = sortedStaff.filter(s => (s.position || "").toUpperCase() === "RN");
  const pnStaff = sortedStaff.filter(s => (s.position || "").toUpperCase() === "PN");

  // Count totals per nurse
  const nurseStats = sortedStaff.map((staff) => {
    let m = 0;
    let e = 0;
    let n = 0;
    let off = 0;
    let l = 0;
    let hours = 0;

    for (const d of dates) {
      const code = assignmentsByNurseAndDate[`${staff.id}_${d}`] || "";
      if (code === "ช" || code === "Day" || code === "D") {
        m++;
        hours += code === "Day" || code === "D" ? 12 : 8;
      } else if (code === "อบ" || code === "บห") {
        hours += 8;
      } else if (code === "บ") {
        e++;
        hours += 8;
      } else if (code === "ด" || code === "Night" || code === "N") {
        n++;
        hours += code === "Night" || code === "N" ? 12 : 8;
      } else if (code === "ชบ") {
        m++;
        e++;
        hours += 16;
      } else if (code === "บด") {
        n++;
        e++;
        hours += 16;
      } else if (code === "ชด") {
        m++;
        n++;
        hours += 16;
      } else if (code === "x" || code === "X" || code === "อ") {
        off++;
      } else if (code === "L" || code === "Va") {
        l++;
      }
    }
    return { staff, m, e, n, off, l, hours };
  });

  // Count totals per day with RN & PN breakdown
  const dailyCounts = dates.map((d) => {
    let mRN = 0, mPN = 0;
    let eRN = 0, ePN = 0;
    let nRN = 0, nPN = 0;

    for (const s of sortedStaff) {
      const isPN = (s.position || "").toUpperCase() === "PN";
      const code = assignmentsByNurseAndDate[`${s.id}_${d}`] || "";
      if (code === "ช" || code === "Day" || code === "D") {
        if (isPN) mPN++; else mRN++;
      } else if (code === "บ") {
        if (isPN) ePN++; else eRN++;
      } else if (code === "ด" || code === "Night" || code === "N") {
        if (isPN) nPN++; else nRN++;
      } else if (code === "ชบ") {
        if (isPN) { mPN++; ePN++; } else { mRN++; eRN++; }
      } else if (code === "บด") {
        if (isPN) { nPN++; ePN++; } else { nRN++; eRN++; }
      } else if (code === "ชด") {
        if (isPN) { mPN++; nPN++; } else { mRN++; nRN++; }
      }
    }
    return {
      date: d,
      mRN, mPN, m: mRN + mPN,
      eRN, ePN, e: eRN + ePN,
      nRN, nPN, n: nRN + nPN,
    };
  });

  const displayedStats =
    printFilter === "rn"
      ? nurseStats.filter((item) => (item.staff.position || "").toUpperCase() === "RN")
      : printFilter === "pn"
      ? nurseStats.filter((item) => (item.staff.position || "").toUpperCase() === "PN")
      : nurseStats;

  return (
    <ModalFrame title="ตัวอย่างพิมพ์ตารางเวร A4" onClose={onClose} className="nf-print-modal">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[98vw] w-full p-6 overflow-x-auto print:max-w-none print:shadow-none print:p-2 print:border-none">
        {/* Controls - Hidden in print */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 print:hidden flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <PrinterIcon className="h-6 w-6 text-blue-600"/>
            <div>
              <h3 className="text-base font-bold text-slate-800">พิมพ์ใบตารางเวรทางการ (Official A4 Print Preview)</h3>
              <p className="text-xs text-slate-500">พร้อมฟอร์มขนาด A4 แนวนอน และช่องลงนามอนุมัติ</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPrintFilter("all")}
                className={`px-2.5 py-1 rounded-lg transition ${printFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
              >
                ทั้งหมด ({nurseStats.length})
              </button>
              <button
                type="button"
                onClick={() => setPrintFilter("rn")}
                className={`px-2.5 py-1 rounded-lg transition ${printFilter === "rn" ? "bg-teal-600 text-white shadow-xs" : "text-teal-800 hover:bg-teal-50"}`}
              >
                เฉพาะ RN ({rnStaff.length})
              </button>
              <button
                type="button"
                onClick={() => setPrintFilter("pn")}
                className={`px-2.5 py-1 rounded-lg transition ${printFilter === "pn" ? "bg-emerald-600 text-white shadow-xs" : "text-emerald-800 hover:bg-emerald-50"}`}
              >
                เฉพาะ PN ({pnStaff.length})
              </button>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <PrinterIcon className="h-5 w-5"/> สั่งพิมพ์ (Print / Save PDF)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
            >
              ปิด
            </button>
          </div>
        </div>

        {/* Printable Official Document */}
        <div className="print-page font-sans text-slate-900 min-w-[1000px]">
          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold tracking-tight">
              ตารางการปฏิบัติงานของบุคลากรทางการพยาบาล {printFilter === "rn" ? "(เฉพาะพยาบาลวิชาชีพ - RN)" : printFilter === "pn" ? "(เฉพาะผู้ช่วยพยาบาล - PN)" : ""}
            </h2>
            <div className="text-xs font-semibold text-slate-700 flex justify-center gap-6 mt-1">
              <span><strong>หน่วยงาน:</strong> {wardName} ({roster.wardId})</span>
              <span><strong>ประจำเดือน:</strong> {thaiMonth} พ.ศ. {thaiYear} ({year})</span>
              <span><strong>สถานะ:</strong> {roster.status === "published" ? "ประกาศใช้งานแล้ว" : roster.status === "approved" ? "อนุมัติแล้ว" : "ร่าง (Draft)"}</span>
              <span><strong>เวอร์ชัน:</strong> v{roster.version}</span>
            </div>
          </div>

          {/* Matrix Table */}
          <table className="w-full border-collapse border border-slate-800 text-[10px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-800 font-bold">
                <th className="border border-slate-800 p-1 w-6 text-center">ที่</th>
                <th className="border border-slate-800 p-1 w-36 text-left">ชื่อ-สกุล</th>
                <th className="border border-slate-800 p-1 w-10 text-center">ตำแหน่ง</th>
                {dates.map((d, i) => {
                  const dayNum = i + 1;
                  const dateObj = new Date(d);
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  return (
                    <th
                      key={d}
                      className={`border border-slate-800 p-0.5 text-center min-w-[20px] ${
                        isWeekend ? "bg-slate-200" : ""
                      }`}
                    >
                      <div>{dayNum}</div>
                    </th>
                  );
                })}
                <th className="border border-slate-800 p-1 w-7 text-center">ช</th>
                <th className="border border-slate-800 p-1 w-7 text-center">บ</th>
                <th className="border border-slate-800 p-1 w-7 text-center">ด</th>
                <th className="border border-slate-800 p-1 w-7 text-center">อ</th>
                <th className="border border-slate-800 p-1 w-7 text-center">L</th>
                <th className="border border-slate-800 p-1 w-10 text-center">ชม.รวม</th>
              </tr>
            </thead>
            <tbody>
              {displayedStats.map((item, idx) => (
                <tr key={`${item.staff.id || "staff"}_${idx}`} className="border-b border-slate-800 hover:bg-slate-50">
                  <td className="border border-slate-800 p-1 text-center font-medium">{idx + 1}</td>
                  <td className="border border-slate-800 p-1 text-left font-semibold truncate max-w-[140px]">
                    {item.staff.name}
                  </td>
                  <td className="border border-slate-800 p-1 text-center font-medium">{item.staff.position}</td>
                  {dates.map((d) => {
                    const code = assignmentsByNurseAndDate[`${item.staff.id}_${d}`] || "";
                    return (
                      <td
                        key={d}
                        className={`border border-slate-800 p-0.5 text-center font-bold ${
                          code === "ด" ? "bg-slate-100" : code === "L" ? "bg-purple-50" : ""
                        }`}
                      >
                        {code}
                      </td>
                    );
                  })}
                  <td className="border border-slate-800 p-1 text-center font-bold">{item.m}</td>
                  <td className="border border-slate-800 p-1 text-center font-bold">{item.e}</td>
                  <td className="border border-slate-800 p-1 text-center font-bold">{item.n}</td>
                  <td className="border border-slate-800 p-1 text-center">{item.off}</td>
                  <td className="border border-slate-800 p-1 text-center">{item.l}</td>
                  <td className="border border-slate-800 p-1 text-center font-bold">{item.hours}</td>
                </tr>
              ))}

              {/* Daily Staffing Summary Rows */}
              {/* เวรเช้า (ช) */}
              <tr className="border-t-2 border-slate-800 font-bold bg-slate-100">
                <td colSpan={3} className="border border-slate-800 p-1 text-left">
                  <div className="flex justify-between items-center text-[9px]">
                    <span>เวรเช้า (ช)</span>
                    <span className="text-slate-500 font-normal">
                      {printFilter === "rn" ? "เฉพาะ RN" : printFilter === "pn" ? "เฉพาะ PN" : "RN / PN / รวม"}
                    </span>
                  </div>
                </td>
                {dailyCounts.map((c) => (
                  <td key={c.date} className="border border-slate-800 p-0.5 text-center leading-tight">
                    {printFilter === "rn" ? (
                      <div className="text-[10px] font-bold text-blue-900">{c.mRN}</div>
                    ) : printFilter === "pn" ? (
                      <div className="text-[10px] font-bold text-amber-900">{c.mPN}</div>
                    ) : (
                      <>
                        <div className="text-[8px] font-semibold text-blue-800">{c.mRN}</div>
                        <div className="text-[8px] font-semibold text-amber-800">{c.mPN}</div>
                        <div className="text-[9px] font-black border-t border-slate-300">{c.m}</div>
                      </>
                    )}
                  </td>
                ))}
                <td colSpan={6} className="border border-slate-800 text-center font-bold">
                  {printFilter === "rn" ? (
                    <div className="text-[9px] font-black text-blue-900">รวม RN: {dailyCounts.reduce((s, c) => s + c.mRN, 0)}</div>
                  ) : printFilter === "pn" ? (
                    <div className="text-[9px] font-black text-amber-900">รวม PN: {dailyCounts.reduce((s, c) => s + c.mPN, 0)}</div>
                  ) : (
                    <>
                      <div className="text-[8px] text-blue-800">RN: {dailyCounts.reduce((s, c) => s + c.mRN, 0)}</div>
                      <div className="text-[8px] text-amber-800">PN: {dailyCounts.reduce((s, c) => s + c.mPN, 0)}</div>
                      <div className="text-[9px] font-black border-t border-slate-300">รวม {dailyCounts.reduce((s, c) => s + c.m, 0)}</div>
                    </>
                  )}
                </td>
              </tr>

              {/* เวรบ่าย (บ) */}
              <tr className="border-b border-slate-800 font-bold bg-slate-100">
                <td colSpan={3} className="border border-slate-800 p-1 text-left">
                  <div className="flex justify-between items-center text-[9px]">
                    <span>เวรบ่าย (บ)</span>
                    <span className="text-slate-500 font-normal">
                      {printFilter === "rn" ? "เฉพาะ RN" : printFilter === "pn" ? "เฉพาะ PN" : "RN / PN / รวม"}
                    </span>
                  </div>
                </td>
                {dailyCounts.map((c) => (
                  <td key={c.date} className="border border-slate-800 p-0.5 text-center leading-tight">
                    {printFilter === "rn" ? (
                      <div className="text-[10px] font-bold text-blue-900">{c.eRN}</div>
                    ) : printFilter === "pn" ? (
                      <div className="text-[10px] font-bold text-amber-900">{c.ePN}</div>
                    ) : (
                      <>
                        <div className="text-[8px] font-semibold text-blue-800">{c.eRN}</div>
                        <div className="text-[8px] font-semibold text-amber-800">{c.ePN}</div>
                        <div className="text-[9px] font-black border-t border-slate-300">{c.e}</div>
                      </>
                    )}
                  </td>
                ))}
                <td colSpan={6} className="border border-slate-800 text-center font-bold">
                  {printFilter === "rn" ? (
                    <div className="text-[9px] font-black text-blue-900">รวม RN: {dailyCounts.reduce((s, c) => s + c.eRN, 0)}</div>
                  ) : printFilter === "pn" ? (
                    <div className="text-[9px] font-black text-amber-900">รวม PN: {dailyCounts.reduce((s, c) => s + c.ePN, 0)}</div>
                  ) : (
                    <>
                      <div className="text-[8px] text-blue-800">RN: {dailyCounts.reduce((s, c) => s + c.eRN, 0)}</div>
                      <div className="text-[8px] text-amber-800">PN: {dailyCounts.reduce((s, c) => s + c.ePN, 0)}</div>
                      <div className="text-[9px] font-black border-t border-slate-300">รวม {dailyCounts.reduce((s, c) => s + c.e, 0)}</div>
                    </>
                  )}
                </td>
              </tr>

              {/* เวรดึก (ด) */}
              <tr className="border-b-2 border-slate-800 font-bold bg-slate-100">
                <td colSpan={3} className="border border-slate-800 p-1 text-left">
                  <div className="flex justify-between items-center text-[9px]">
                    <span>เวรดึก (ด)</span>
                    <span className="text-slate-500 font-normal">
                      {printFilter === "rn" ? "เฉพาะ RN" : printFilter === "pn" ? "เฉพาะ PN" : "RN / PN / รวม"}
                    </span>
                  </div>
                </td>
                {dailyCounts.map((c) => (
                  <td key={c.date} className="border border-slate-800 p-0.5 text-center leading-tight">
                    {printFilter === "rn" ? (
                      <div className="text-[10px] font-bold text-blue-900">{c.nRN}</div>
                    ) : printFilter === "pn" ? (
                      <div className="text-[10px] font-bold text-amber-900">{c.nPN}</div>
                    ) : (
                      <>
                        <div className="text-[8px] font-semibold text-blue-800">{c.nRN}</div>
                        <div className="text-[8px] font-semibold text-amber-800">{c.nPN}</div>
                        <div className="text-[9px] font-black border-t border-slate-300">{c.n}</div>
                      </>
                    )}
                  </td>
                ))}
                <td colSpan={6} className="border border-slate-800 text-center font-bold">
                  {printFilter === "rn" ? (
                    <div className="text-[9px] font-black text-blue-900">รวม RN: {dailyCounts.reduce((s, c) => s + c.nRN, 0)}</div>
                  ) : printFilter === "pn" ? (
                    <div className="text-[9px] font-black text-amber-900">รวม PN: {dailyCounts.reduce((s, c) => s + c.nPN, 0)}</div>
                  ) : (
                    <>
                      <div className="text-[8px] text-blue-800">RN: {dailyCounts.reduce((s, c) => s + c.nRN, 0)}</div>
                      <div className="text-[8px] text-amber-800">PN: {dailyCounts.reduce((s, c) => s + c.nPN, 0)}</div>
                      <div className="text-[9px] font-black border-t border-slate-300">รวม {dailyCounts.reduce((s, c) => s + c.n, 0)}</div>
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Official Signatures */}
          <div className="grid grid-cols-2 gap-12 mt-8 pt-4 text-xs font-semibold text-center">
            <div className="space-y-1">
              <div>ลงชื่อ ..........................................................................</div>
              <div className="text-slate-600">(..........................................................................)</div>
              <div className="font-bold">หัวหน้าหอผู้ป่วย / ผู้จัดทำตารางเวร</div>
              <div className="text-[11px] text-slate-500">วันที่ ..... / ................... / ..........</div>
            </div>

            <div className="space-y-1">
              <div>ลงชื่อ ..........................................................................</div>
              <div className="text-slate-600">(..........................................................................)</div>
              <div className="font-bold">หัวหน้าฝ่ายการพยาบาล / ผู้อนุมัติ</div>
              <div className="text-[11px] text-slate-500">วันที่ ..... / ................... / ..........</div>
            </div>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
