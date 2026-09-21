"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { Roster } from "@/types/schedule";

interface Props {
  dates: string[];
  rosterId: number;
  token: string;
  roster?: Roster;
  filterPosition?: "all" | "rn" | "pn";
}

interface Interval {
  name?: string;
  actualTotal: number;
  requiredTotal: number;
  deficit: number;
}
interface Daily {
  date: string;
  intervals: Interval[];
}

export const STANDARD_PERIODS = [
  { key: "morning", label: "08:00–16:00 (เช้า)", start: 480, end: 960, shiftCode: "ช" },
  { key: "afternoon", label: "16:00–24:00 (บ่าย)", start: 960, end: 1440, shiftCode: "บ" },
  { key: "night", label: "00:00–08:00 (ดึก)", start: 0, end: 480, shiftCode: "ด" },
];

export interface CoverageItem {
  actual: number;
  target: number;
  actualRN: number;
  targetRN: number;
  actualPN: number;
  targetPN: number;
}

export function getShiftPeriodWeight(code: string, periodKey: string, shiftPeriods?: { start: number; end: number }[], periodWindow?: { start: number; end: number }): number {
  const c = code.trim();
  if (periodKey === "morning") {
    // ช = COUNTIF("ช") + COUNTIF("ชบ") + COUNTIF("D") + COUNTIF("ชด")
    if (c === "ช" || c === "ชบ" || c === "ชด" || c === "D" || c === "Day" || c === "12D") return 1.0;
    if (c === "บ" || c === "ด" || c === "บด" || c === "N" || c === "Night" || c === "12N") return 0;
  } else if (periodKey === "afternoon") {
    // บ = COUNTIF("บ") + COUNTIF("ชบ") + COUNTIF("D")*0.5 + COUNTIF("N")*0.5
    if (c === "บ" || c === "ชบ" || c === "บด") return 1.0;
    if (c === "D" || c === "Day" || c === "12D" || c === "N" || c === "Night" || c === "12N") return 0.5;
    if (c === "ช" || c === "ด" || c === "ชด") return 0;
  } else if (periodKey === "night") {
    // ด = COUNTIF("ด") + COUNTIF("ชด") + COUNTIF("N")
    if (c === "ด" || c === "ชด" || c === "บด" || c === "N" || c === "Night" || c === "12N") return 1.0;
    if (c === "ช" || c === "บ" || c === "ชบ" || c === "D" || c === "Day" || c === "12D") return 0;
  }

  // Fallback for custom configured shifts
  if (shiftPeriods && periodWindow) {
    let overlapMins = 0;
    for (const sp of shiftPeriods) {
      const oStart = Math.max(sp.start, periodWindow.start);
      const oEnd = Math.min(sp.end, periodWindow.end);
      if (oEnd > oStart) {
        overlapMins += (oEnd - oStart);
      }
    }
    if (overlapMins > 0) {
      return overlapMins >= 480 ? 1.0 : overlapMins / 480.0;
    }
  }
  return 0;
}

export function formatStaffCount(val: number): string {
  if (Number.isInteger(val)) return val.toString();
  return Number(val.toFixed(1)).toString();
}

export function computeRosterDailyCoverage(roster: Roster | undefined, dates: string[]) {
  if (!roster) return {};

  // Map shift lookup
  const shiftMap: Record<string, { periods: { start: number; end: number }[] }> = {};
  for (const sh of roster.shifts || []) {
    shiftMap[sh.code] = sh;
  }

  // Default shift periods if missing
  if (!shiftMap["ช"]) shiftMap["ช"] = { periods: [{ start: 480, end: 960 }] };
  if (!shiftMap["บ"]) shiftMap["บ"] = { periods: [{ start: 960, end: 1440 }] };
  if (!shiftMap["ด"]) shiftMap["ด"] = { periods: [{ start: 0, end: 480 }] };
  if (!shiftMap["ชบ"]) shiftMap["ชบ"] = { periods: [{ start: 480, end: 960 }, { start: 960, end: 1440 }] };
  if (!shiftMap["บด"]) shiftMap["บด"] = { periods: [{ start: 960, end: 1440 }, { start: 0, end: 480 }] };
  if (!shiftMap["ชด"]) shiftMap["ชด"] = { periods: [{ start: 480, end: 960 }, { start: 0, end: 480 }] };
  if (!shiftMap["D"]) shiftMap["D"] = { periods: [{ start: 480, end: 1200 }] };
  if (!shiftMap["Day"]) shiftMap["Day"] = { periods: [{ start: 480, end: 1200 }] };
  if (!shiftMap["N"]) shiftMap["N"] = { periods: [{ start: 1200, end: 1920 }] };
  if (!shiftMap["Night"]) shiftMap["Night"] = { periods: [{ start: 1200, end: 1920 }] };

  // Staff position lookup
  const staffMap: Record<string, { active: boolean; position: string }> = {};
  for (const n of roster.staff || []) {
    staffMap[n.id] = {
      active: !!n.active,
      position: (n.position || "").toUpperCase(),
    };
  }

  // Date to assignments with nurseId
  const dateAssignments: Record<string, { nurseId: string; code: string }[]> = {};
  for (const cell of roster.assignments || []) {
    const code = cell.shiftCode?.trim();
    if (!code || code === "x" || code === "X" || code === "อ" || code === "L" || code === "Va" || code === "V" || code === "v") continue;
    const st = staffMap[cell.nurseId];
    if (!st || !st.active) continue;
    if (!dateAssignments[cell.date]) dateAssignments[cell.date] = [];
    dateAssignments[cell.date].push({ nurseId: cell.nurseId, code });
  }

  // Policy staffing lookup
  const policyStaffing = (roster.policy?.staffing as Array<{ date?: string; start: number; end: number; rn?: number; pn?: number; leaders?: number }>) || [];

  const result: Record<string, Record<string, CoverageItem>> = {};

  for (const date of dates) {
    result[date] = {};
    const assigned = dateAssignments[date] || [];

    for (const p of STANDARD_PERIODS) {
      // Calculate actual count (Total, RN, PN) using hospital formula
      let actualTotal = 0;
      let actualRN = 0;
      let actualPN = 0;

      for (const item of assigned) {
        const sh = shiftMap[item.code];
        const weight = getShiftPeriodWeight(item.code, p.key, sh?.periods, { start: p.start, end: p.end });
        if (weight > 0) {
          actualTotal += weight;
          const pos = staffMap[item.nurseId]?.position;
          if (pos === "PN") {
            actualPN += weight;
          } else {
            actualRN += weight;
          }
        }
      }

      // Calculate target count from policy
      let targetRN = 0;
      let targetPN = 0;
      let targetTotal = 0;

      // 1. Specific date match
      let matched = false;
      for (const req of policyStaffing) {
        if (req.date === date && ((req.start <= p.start && req.end >= p.end) || (req.start === p.start && req.end === p.end))) {
          targetRN = (req.rn || 0) + (req.leaders || 0);
          targetPN = req.pn || 0;
          targetTotal = targetRN + targetPN;
          matched = true;
          break;
        }
      }
      // 2. Default match
      if (!matched) {
        for (const req of policyStaffing) {
          if ((!req.date || req.date === "") && ((req.start <= p.start && req.end >= p.end) || (req.start === p.start && req.end === p.end))) {
            targetRN = (req.rn || 0) + (req.leaders || 0);
            targetPN = req.pn || 0;
            targetTotal = targetRN + targetPN;
            matched = true;
            break;
          }
        }
      }
      // 3. 12-hour night policy requirement match (20:00-08:00 => 1200-1920)
      if (!matched && p.key === "night") {
        for (const req of policyStaffing) {
          if (req.date === date && req.start >= 1200 && req.end >= 1920) {
            targetRN = (req.rn || 0) + (req.leaders || 0);
            targetPN = req.pn || 0;
            targetTotal = targetRN + targetPN;
            matched = true;
            break;
          }
        }
        if (!matched) {
          for (const req of policyStaffing) {
            if ((!req.date || req.date === "") && req.start >= 1200 && req.end >= 1920) {
              targetRN = (req.rn || 0) + (req.leaders || 0);
              targetPN = req.pn || 0;
              targetTotal = targetRN + targetPN;
              break;
            }
          }
        }
      }

      result[date][p.key] = {
        actual: actualTotal,
        target: targetTotal,
        actualRN,
        targetRN,
        actualPN,
        targetPN,
      };
    }
  }

  return result;
}

export function computeRosterDailyLeaves(roster: Roster | undefined, dates: string[]) {
  const map: Record<string, { vacation: number; leave: number; off: number }> = {};
  for (const d of dates) {
    map[d] = { vacation: 0, leave: 0, off: 0 };
  }
  if (!roster?.assignments) return map;

  for (const a of roster.assignments) {
    const code = a.shiftCode?.trim();
    if (!code || !map[a.date]) continue;
    if (code === "V" || code === "v" || code === "Va") {
      map[a.date].vacation++;
    } else if (code === "L") {
      map[a.date].leave++;
    } else if (code === "x" || code === "X" || code === "อ") {
      map[a.date].off++;
    }
  }
  return map;
}

export function CoverageSummaryRow({ dates, rosterId, token, roster, filterPosition = "all" }: Props) {
  const [, setDaily] = useState<Record<string, Daily>>({});
  const [loading, setLoading] = useState(false);

  // Fetch summary from API as background sync
  useEffect(() => {
    if (!rosterId || !token) return;
    const controller = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"}/schedules/${rosterId}/daily-staffing`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("summary"))))
      .then((body) => {
        const map: Record<string, Daily> = {};
        for (const item of body.data || []) map[item.date] = item;
        setDaily(map);
      })
      .catch(() => {
        // ignore fetch error
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [rosterId, token, roster?.assignments?.length]);

  // Real-time calculation directly from current roster state
  const computedDaily = useMemo(() => computeRosterDailyCoverage(roster, dates), [roster, dates]);
  const dailyLeaves = useMemo(() => computeRosterDailyLeaves(roster, dates), [roster, dates]);

  const totalVacationAll = dates.reduce((sum, d) => sum + (dailyLeaves[d]?.vacation ?? 0), 0);
  const totalLeaveAll = dates.reduce((sum, d) => sum + (dailyLeaves[d]?.leave ?? 0), 0);

  return (
    <>
      {STANDARD_PERIODS.map((period, pIdx) => {
        const totalActualPeriod = dates.reduce((sum, d) => sum + (computedDaily[d]?.[period.key]?.actual ?? 0), 0);
        const totalRnPeriod = dates.reduce((sum, d) => sum + (computedDaily[d]?.[period.key]?.actualRN ?? 0), 0);
        const totalPnPeriod = dates.reduce((sum, d) => sum + (computedDaily[d]?.[period.key]?.actualPN ?? 0), 0);

        return (
          <React.Fragment key={period.key}>
            {/* Header row for the period with sub-breakdown for RN & PN */}
            <tr className={`border-t ${pIdx === 0 ? "border-t-2 border-slate-300" : "border-slate-200"} bg-slate-100/90 hover:bg-slate-200/50 transition`}>
              <th scope="row" className="coverage-label px-3 py-2 text-left font-bold text-xs text-slate-800 bg-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-slate-900">{period.label}</span>
                  <div className="flex items-center gap-1">
                    {filterPosition === "all" ? (
                      <>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">RN</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">PN</span>
                        <span className="text-[9px] font-semibold text-slate-400 ml-1">รวม</span>
                      </>
                    ) : filterPosition === "rn" ? (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-300">เฉพาะ RN</span>
                    ) : (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">เฉพาะ PN</span>
                    )}
                  </div>
                </div>
              </th>

              {dates.map((date, dateIdx) => {
                const comp = computedDaily[date]?.[period.key];
                const actualRN = comp ? comp.actualRN : 0;
                const targetRN = comp ? comp.targetRN : 0;
                const actualPN = comp ? comp.actualPN : 0;
                const targetPN = comp ? comp.targetPN : 0;
                const actual = comp ? comp.actual : 0;
                const target = comp ? comp.target : 0;

                // For Night period (00:00 - 08:00): calculate deficit from immediately preceding shift (Yesterday Evening: 16:00 - 24:00)
                const prevDate = dateIdx > 0 ? dates[dateIdx - 1] : "";
                const compPrevEve = prevDate ? computedDaily[prevDate]?.["afternoon"] : undefined;
                const eveDeficitRN = period.key === "night" && compPrevEve ? Math.max(0, (compPrevEve.targetRN || 0) - (compPrevEve.actualRN || 0)) : 0;
                const eveDeficitPN = period.key === "night" && compPrevEve ? Math.max(0, (compPrevEve.targetPN || 0) - (compPrevEve.actualPN || 0)) : 0;
                const eveDeficitTotal = period.key === "night" && compPrevEve ? Math.max(0, (compPrevEve.target || 0) - (compPrevEve.actual || 0)) : 0;

                const maxAllowedRN = targetRN + eveDeficitRN;
                const maxAllowedPN = targetPN + eveDeficitPN;
                const maxAllowedTotal = target + eveDeficitTotal;

                const isShortRN = period.key === "afternoon"
                  ? (targetRN > 0 && actualRN < targetRN - 0.501)
                  : (targetRN > 0 && actualRN < targetRN - 0.001);
                const isOverRN = targetRN > 0 && actualRN > maxAllowedRN + 0.001;

                const isShortPN = period.key === "afternoon"
                  ? (targetPN > 0 && actualPN < targetPN - 0.501)
                  : (targetPN > 0 && actualPN < targetPN - 0.001);
                const isOverPN = targetPN > 0 && actualPN > maxAllowedPN + 0.001;

                const isTotalShort = period.key === "afternoon"
                  ? (target > 0 && actual < target - 0.501)
                  : (target > 0 && actual < target - 0.001);
                const isTotalOver = target > 0 && actual > maxAllowedTotal + 0.001;

                const isHighlightedOver = filterPosition === "rn" ? isOverRN : filterPosition === "pn" ? isOverPN : isTotalOver;
                const isHighlightedShort = filterPosition === "rn" ? isShortRN : filterPosition === "pn" ? isShortPN : (isTotalShort || isShortRN || isShortPN);

                return (
                  <td
                    key={date}
                    className={`coverage-cell text-center text-xs px-1 py-1 select-none transition ${
                      isHighlightedOver
                        ? "bg-purple-50/90 border border-purple-200"
                        : isHighlightedShort
                        ? "bg-rose-50/90 border border-rose-200"
                        : "bg-white/80 hover:bg-slate-50"
                    }`}
                    title={`${date} (${period.label}):\n• RN: ${formatStaffCount(actualRN)}/${targetRN} คน ${isOverRN ? `(เกิน +${formatStaffCount(actualRN - targetRN)})` : isShortRN ? `(ขาด -${formatStaffCount(targetRN - actualRN)})` : "(ครบ)"}\n• PN: ${formatStaffCount(actualPN)}/${targetPN} คน ${isOverPN ? `(เกิน +${formatStaffCount(actualPN - targetPN)})` : isShortPN ? `(ขาด -${formatStaffCount(targetPN - actualPN)})` : "(ครบ)"}\n• รวม: ${formatStaffCount(actual)}/${target} คน`}
                  >
                    {loading ? "…" : (
                      <div className="flex flex-col items-center justify-center gap-0.5 leading-tight py-0.5">
                        {filterPosition === "rn" ? (
                          <div className={`text-xs font-bold px-1.5 py-0.5 rounded w-full flex flex-col items-center justify-center ${
                            isOverRN ? "bg-purple-100 text-purple-900 font-black" : isShortRN ? "bg-rose-100 text-rose-800 font-black" : "text-teal-800 bg-teal-50"
                          }`}>
                            <span className="text-[11px] font-extrabold">{formatStaffCount(actualRN)} / {targetRN}</span>
                            {isOverRN && <span className="text-[8px] text-purple-800">+{(actualRN - targetRN).toFixed(1)}</span>}
                            {isShortRN && <span className="text-[8px] text-rose-700 font-bold">ขาด {(targetRN - actualRN).toFixed(1)}</span>}
                          </div>
                        ) : filterPosition === "pn" ? (
                          <div className={`text-xs font-bold px-1.5 py-0.5 rounded w-full flex flex-col items-center justify-center ${
                            isOverPN ? "bg-purple-100 text-purple-900 font-black" : isShortPN ? "bg-rose-100 text-rose-800 font-black" : "text-emerald-800 bg-emerald-50"
                          }`}>
                            <span className="text-[11px] font-extrabold">{formatStaffCount(actualPN)} / {targetPN}</span>
                            {isOverPN && <span className="text-[8px] text-purple-800">+{(actualPN - targetPN).toFixed(1)}</span>}
                            {isShortPN && <span className="text-[8px] text-rose-700 font-bold">ขาด {(targetPN - actualPN).toFixed(1)}</span>}
                          </div>
                        ) : (
                          <>
                            {/* RN breakdown */}
                            <div className={`text-[10px] font-bold px-1 py-0.2 rounded w-full flex items-center justify-center gap-0.5 ${
                              isOverRN ? "bg-purple-100 text-purple-900" : isShortRN ? "bg-rose-100 text-rose-800" : "text-blue-700 bg-blue-50/80"
                            }`}>
                              <span className="text-[8px] opacity-70">RN:</span>
                              <span>{formatStaffCount(actualRN)}/{targetRN}</span>
                            </div>

                            {/* PN breakdown */}
                            <div className={`text-[10px] font-bold px-1 py-0.2 rounded w-full flex items-center justify-center gap-0.5 ${
                              isOverPN ? "bg-purple-100 text-purple-900" : isShortPN ? "bg-rose-100 text-rose-800" : "text-amber-800 bg-amber-50/80"
                            }`}>
                              <span className="text-[8px] opacity-70">PN:</span>
                              <span>{formatStaffCount(actualPN)}/{targetPN}</span>
                            </div>

                            {/* Total indicator */}
                            {isTotalOver ? (
                              <span className="text-[8px] bg-purple-200 text-purple-900 font-black px-1 rounded">
                                รวม {formatStaffCount(actual)}/{target} (+{formatStaffCount(actual - target)})
                              </span>
                            ) : isTotalShort ? (
                              <span className="text-[8px] bg-rose-200 text-rose-900 font-black px-1 rounded">
                                รวม {formatStaffCount(actual)}/{target} (ขาด {formatStaffCount(target - actual)})
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}

              <td className="coverage-cell bg-slate-200/80 text-center font-bold text-xs text-slate-800 px-2 py-2">
                {loading ? (
                  "…"
                ) : filterPosition === "rn" ? (
                  <div className="flex flex-col items-center justify-center gap-0.5 text-xs">
                    <span className="text-teal-900 font-black text-[11px]">RN รวม {formatStaffCount(totalRnPeriod)}</span>
                  </div>
                ) : filterPosition === "pn" ? (
                  <div className="flex flex-col items-center justify-center gap-0.5 text-xs">
                    <span className="text-emerald-900 font-black text-[11px]">PN รวม {formatStaffCount(totalPnPeriod)}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-0.5 text-[10px]">
                    <span className="text-blue-800 font-bold">RN: {formatStaffCount(totalRnPeriod)}</span>
                    <span className="text-amber-800 font-bold">PN: {formatStaffCount(totalPnPeriod)}</span>
                    <span className="text-slate-600 font-extrabold text-[11px] border-t border-slate-300 w-full pt-0.5 mt-0.5">
                      รวม {formatStaffCount(totalActualPeriod)}
                    </span>
                  </div>
                )}
              </td>
            </tr>
          </React.Fragment>
        );
      })}

      {/* Vacation Leave (V) & Leave (L) Daily Summary Row */}
      <tr className="border-t border-slate-200 bg-purple-50/70 hover:bg-purple-100/70 transition">
        <th scope="row" className="coverage-label px-3 py-2 text-left font-bold text-xs text-purple-950 bg-purple-50">
          <div className="flex items-center justify-between gap-2">
            <span className="font-extrabold flex items-center gap-1 text-purple-900">
              <span>🌴</span>
              <span>ลาพักร้อน (V) / ลา (L)</span>
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-200 text-purple-900" title="ลาพักร้อน (8 ชม.)">V (8h)</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-200 text-rose-900" title="วันลาทั่วไป">L</span>
            </div>
          </div>
        </th>

        {dates.map((date) => {
          const lData = dailyLeaves[date];
          const vCount = lData?.vacation ?? 0;
          const lCount = lData?.leave ?? 0;
          const hasLeave = vCount > 0 || lCount > 0;

          return (
            <td
              key={date}
              className={`coverage-cell text-center text-xs px-1 py-1 transition ${
                hasLeave ? "bg-purple-100/90 font-bold border border-purple-200" : "bg-white/60 hover:bg-purple-50/50"
              }`}
              title={`${date}:\n• ลาพักร้อน (V): ${vCount} คน (8 ชม. Credit)\n• วันลาทั่วไป (L): ${lCount} คน`}
            >
              {hasLeave ? (
                <div className="flex flex-col items-center justify-center text-[10px] leading-tight gap-0.5">
                  {vCount > 0 && (
                    <span className="text-[9px] text-purple-900 font-extrabold bg-purple-200 px-1 py-0.2 rounded w-full">
                      V: {vCount}
                    </span>
                  )}
                  {lCount > 0 && (
                    <span className="text-[9px] text-rose-900 font-extrabold bg-rose-200 px-1 py-0.2 rounded w-full">
                      L: {lCount}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-slate-300 text-[10px]">-</span>
              )}
            </td>
          );
        })}

        <td className="coverage-cell bg-purple-100 text-center font-bold text-xs text-purple-950 px-2 py-2">
          <div className="flex flex-col items-center justify-center gap-0.5 text-[10px]">
            <span className="text-purple-900 font-bold">V: {totalVacationAll}</span>
            <span className="text-rose-900 font-bold">L: {totalLeaveAll}</span>
            <span className="text-purple-950 font-extrabold text-[11px] border-t border-purple-300 w-full pt-0.5 mt-0.5">
              รวม {totalVacationAll + totalLeaveAll}
            </span>
          </div>
        </td>
      </tr>
    </>
  );
}

