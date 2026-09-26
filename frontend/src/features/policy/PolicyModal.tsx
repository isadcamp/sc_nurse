"use client";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Cog6ToothIcon, XMarkIcon, PlusIcon, TrashIcon, SparklesIcon, CodeBracketIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { request } from "@/lib/api";
import type { Roster, RosterResponse } from "@/types/schedule";

type Target = { nurseId: string; hours: number; off: number; quotas: Record<string, number> };
type Staffing = { date: string; start: number; end: number; rn: number; pn: number; leaders: number; skills: Record<string, number> };

interface PolicyModalProps {
  roster: Roster;
  token: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: RosterResponse) => void;
}

export function formatThaiSpoken(mins: number): string {
  const normMins = mins % 1440;
  const h = Math.floor(normMins / 60);
  const m = normMins % 60;
  const mText = m === 30 ? "ครึ่ง" : m > 0 ? ` ${m} นาที` : "";

  if (mins === 1440 || (mins === 0 && h === 0 && m === 0)) {
    return `เที่ยงคืน${mText}`;
  }
  if (h === 0) {
    return `เที่ยงคืน${mText}`;
  }
  if (h >= 1 && h <= 5) {
    const numbers = ["", "ตี 1", "ตี 2", "ตี 3", "ตี 4", "ตี 5"];
    return `${numbers[h]}${mText}`;
  }
  if (h >= 6 && h <= 10) {
    return `${h} โมงเช้า${mText}`;
  }
  if (h === 11) {
    return `11 โมง${mText}`;
  }
  if (h === 12) {
    return `เที่ยง${m === 30 ? "ครึ่ง" : mText}`;
  }
  if (h === 13) {
    return `บ่ายโมง${mText}`;
  }
  if (h >= 14 && h <= 15) {
    return `บ่าย ${h - 12}${mText}`;
  }
  if (h === 16) {
    return `4 โมงเย็น${mText}`;
  }
  if (h >= 17 && h <= 18) {
    return `${h - 12} โมงเย็น${mText}`;
  }
  if (h >= 19 && h <= 23) {
    return `${h - 18} ทุ่ม${mText}`;
  }
  return "";
}

export function formatThaiTimeLabel(mins: number, isNextDay = false): string {
  const normMins = mins % 1440;
  const h = Math.floor(normMins / 60);
  const m = normMins % 60;
  const time24 = `${String(h).padStart(2, "0")}.${String(m).padStart(2, "0")} น.`;
  const spoken = formatThaiSpoken(mins);
  const nextDay = isNextDay || mins >= 1440 ? " (วันถัดไป)" : "";
  return `${time24} (${spoken})${nextDay}`;
}

const PRESET_PERIODS = [
  { label: "เวรเช้า (08.00 น. 8 โมงเช้า - 16.00 น. 4 โมงเย็น)", start: 480, end: 960 },
  { label: "เวรบ่าย (16.00 น. 4 โมงเย็น - 24.00 น. เที่ยงคืน)", start: 960, end: 1440 },
  { label: "เวรดึก (00.00 น. เที่ยงคืน - 08.00 น. 8 โมงเช้า)", start: 0, end: 480 },
  { label: "เวร 12 ชม. กลางวัน (08.00 น. 8 โมงเช้า - 20.00 น. 2 ทุ่ม)", start: 480, end: 1200 },
  { label: "เวร 12 ชม. กลางคืน (20.00 น. 2 ทุ่ม - 08.00 น. 8 โมงเช้าวันถัดไป)", start: 1200, end: 1920 },
];

const DEFAULT_3_SHIFTS: Staffing[] = [
  { date: "", start: 480, end: 960, rn: 2, pn: 1, leaders: 1, skills: {} },
  { date: "", start: 960, end: 1440, rn: 2, pn: 1, leaders: 1, skills: {} },
  { date: "", start: 0, end: 480, rn: 1, pn: 1, leaders: 1, skills: {} },
];

const DEFAULT_12H_SHIFTS: Staffing[] = [
  { date: "", start: 480, end: 1200, rn: 2, pn: 1, leaders: 1, skills: {} },
  { date: "", start: 1200, end: 1920, rn: 2, pn: 1, leaders: 1, skills: {} },
];

function minsToTimeString(mins: number): string {
  const normMins = mins % 1440;
  const h = Math.floor(normMins / 60);
  const m = normMins % 60;
  return `${String(h).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
}

function timeStringToMins(timeStr: string, isNextDay = false): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.replace(".", ":").split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0);
  return isNextDay ? total + 1440 : total;
}

export function PolicyModal({ roster, token, isOpen, onClose, onSaved }: PolicyModalProps) {
  const currentPolicy = roster.policy || {};
  const policyAny = currentPolicy as unknown as { targets?: Target[]; staffing?: Staffing[] };
  const [minRestHours, setMinRestHours] = useState(currentPolicy.minRestHours ?? 8);
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState(currentPolicy.maxConsecutiveDays ?? 6);
  const [maxConsecutiveNights, setMaxConsecutiveNights] = useState(currentPolicy.maxConsecutiveNights ?? 3);
  const [maxConsecutiveOffDays, setMaxConsecutiveOffDays] = useState(currentPolicy.maxConsecutiveOffDays ?? 2);
  const [compressOffOnShortage, setCompressOffOnShortage] = useState(currentPolicy.compressOffOnShortage ?? true);
  const [allowOTOnShortage, setAllowOTOnShortage] = useState(currentPolicy.allowOTOnShortage ?? true);
  const [maxMonthlyHours, setMaxMonthlyHours] = useState(currentPolicy.maxMonthlyHours ?? 240);
  const [maxContinuousHours, setMaxContinuousHours] = useState(currentPolicy.maxContinuousHours ?? 16);
  const [maxDoubleShifts, setMaxDoubleShifts] = useState(currentPolicy.maxDoubleShifts ?? 8);
  const [fairnessHours, setFairnessHours] = useState(currentPolicy.fairnessHours ?? 48);
  const [targets, setTargets] = useState<Target[]>(() =>
    roster.staff.filter((n) => n.active).map((n) => policyAny.targets?.find((t: Target) => t.nurseId === n.id) ?? { nurseId: n.id, hours: 160, off: 0, quotas: {} })
  );
  const [bulkHours, setBulkHours] = useState(160);
  const [bulkOff, setBulkOff] = useState(8);

  // Staffing list state
  const [staffingList, setStaffingList] = useState<Staffing[]>(() => {
    if (policyAny.staffing && Array.isArray(policyAny.staffing) && policyAny.staffing.length > 0) {
      return policyAny.staffing;
    }
    return DEFAULT_3_SHIFTS;
  });

  const [staffingMode, setStaffingMode] = useState<"visual" | "json">("visual");
  const [staffingJson, setStaffingJson] = useState(() =>
    JSON.stringify(policyAny.staffing && policyAny.staffing.length > 0 ? policyAny.staffing : DEFAULT_3_SHIFTS, null, 2)
  );

  const [wCoverage, setWCoverage] = useState(currentPolicy.weights?.coverage ?? 100);
  const [wFairness, setWFairness] = useState(currentPolicy.weights?.fairness ?? 50);
  const [wPreference, setWPreference] = useState(currentPolicy.weights?.preference ?? 20);
  const [wStability, setWStability] = useState(currentPolicy.weights?.stability ?? 10);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  function syncListToJson(list: Staffing[]) {
    setStaffingList(list);
    setStaffingJson(JSON.stringify(list, null, 2));
  }

  function handleSetDefaultsFromStaff() {
    const activeStaff = roster.staff.filter((n) => n.active);
    const totalN = activeStaff.length;
    const numRN = activeStaff.filter((n) => n.position === "RN").length;
    const numPN = activeStaff.filter((n) => n.position === "PN").length;
    const numLeaders = activeStaff.filter((n) => n.leader).length;

    if (totalN === 0) {
      setError("ไม่พบบุคลากรที่มีสถานะใช้งานในวอร์ดนี้");
      return;
    }

    // 1. Calculate realistic staffing requirements per shift based on actual available nurses
    let calculatedStaffing: Staffing[];

    if (totalN <= 4) {
      // Very small team (2-4 nurses)
      calculatedStaffing = [
        { date: "", start: 480, end: 960, rn: Math.min(1, numRN), pn: numRN > 0 ? 0 : Math.min(1, numPN), leaders: Math.min(1, numLeaders), skills: {} },
        { date: "", start: 960, end: 1440, rn: Math.min(1, numRN), pn: 0, leaders: 0, skills: {} },
        { date: "", start: 0, end: 480, rn: Math.min(1, numRN), pn: 0, leaders: 0, skills: {} },
      ];
    } else if (totalN <= 7) {
      // Small team (5-7 nurses)
      calculatedStaffing = [
        { date: "", start: 480, end: 960, rn: Math.max(1, Math.min(2, numRN)), pn: numPN > 0 ? 1 : 0, leaders: Math.min(1, numLeaders), skills: {} },
        { date: "", start: 960, end: 1440, rn: 1, pn: 0, leaders: numLeaders >= 2 ? 1 : 0, skills: {} },
        { date: "", start: 0, end: 480, rn: 1, pn: 0, leaders: numLeaders >= 3 ? 1 : 0, skills: {} },
      ];
    } else if (totalN <= 12) {
      // Medium team (8-12 nurses)
      calculatedStaffing = [
        { date: "", start: 480, end: 960, rn: Math.max(1, Math.min(2, numRN)), pn: numPN > 0 ? 1 : 0, leaders: Math.min(1, numLeaders), skills: {} },
        { date: "", start: 960, end: 1440, rn: Math.max(1, Math.min(2, numRN)), pn: numPN >= 2 ? 1 : 0, leaders: numLeaders >= 2 ? 1 : 0, skills: {} },
        { date: "", start: 0, end: 480, rn: 1, pn: numPN >= 3 ? 1 : 0, leaders: numLeaders >= 3 ? 1 : 0, skills: {} },
      ];
    } else {
      // Large team (13+ nurses)
      const morningRN = Math.max(1, Math.min(Math.floor(numRN * 0.45), 4));
      const afternoonRN = Math.max(1, Math.min(Math.floor(numRN * 0.35), 3));
      const nightRN = Math.max(1, Math.min(Math.floor(numRN * 0.20), 2));
      const morningPN = numPN > 0 ? Math.max(1, Math.min(Math.floor(numPN * 0.45), 2)) : 0;
      const afternoonPN = numPN > 0 ? Math.max(0, Math.min(Math.floor(numPN * 0.35), 2)) : 0;
      const nightPN = numPN > 0 ? Math.max(0, Math.min(Math.floor(numPN * 0.20), 1)) : 0;

      calculatedStaffing = [
        { date: "", start: 480, end: 960, rn: morningRN, pn: morningPN, leaders: Math.min(1, numLeaders), skills: {} },
        { date: "", start: 960, end: 1440, rn: afternoonRN, pn: afternoonPN, leaders: numLeaders >= 2 ? 1 : 0, skills: {} },
        { date: "", start: 0, end: 480, rn: nightRN, pn: nightPN, leaders: numLeaders >= 3 ? 1 : 0, skills: {} },
      ];
    }

    syncListToJson(calculatedStaffing);

    // 2. Set default individual targets (160 hrs, 8 off days)
    const newTargets: Target[] = activeStaff.map((n) => ({
      nurseId: n.id,
      hours: 160,
      off: 8,
      quotas: {},
    }));
    setTargets(newTargets);

    // 3. Reset standard safety constraints & weights
    setMinRestHours(8);
    setMaxConsecutiveDays(6);
    setMaxConsecutiveNights(3);
    setMaxMonthlyHours(240);
    setMaxContinuousHours(16);
    setMaxDoubleShifts(8);
    setFairnessHours(48);

    setWCoverage(100);
    setWFairness(50);
    setWPreference(20);
    setWStability(10);

    setError("");
    setSuccessMsg(`✨ ตั้งค่าเริ่มต้นสำเร็จตามบุคลากร ${totalN} คน (RN: ${numRN}, PN: ${numPN}, หัวหน้าเวร: ${numLeaders})`);
  }

  function handleAddStaffingRow() {
    const updated = [...staffingList, { date: "", start: 480, end: 960, rn: 1, pn: 1, leaders: 1, skills: {} }];
    syncListToJson(updated);
  }

  function handleRemoveStaffingRow(index: number) {
    const updated = staffingList.filter((_, i) => i !== index);
    syncListToJson(updated);
  }

  function handleUpdateStaffingRow(index: number, changes: Partial<Staffing>) {
    const updated = staffingList.map((item, i) => (i === index ? { ...item, ...changes } : item));
    syncListToJson(updated);
  }

  function handleApplyPresets(presetType: "3shifts" | "12h") {
    syncListToJson(presetType === "3shifts" ? DEFAULT_3_SHIFTS : DEFAULT_12H_SHIFTS);
  }

  function handleSwitchMode(mode: "visual" | "json") {
    if (mode === "visual") {
      try {
        const parsed = JSON.parse(staffingJson);
        if (Array.isArray(parsed)) {
          setStaffingList(parsed);
        }
      } catch {
        // keep previous list if invalid json
      }
    } else {
      setStaffingJson(JSON.stringify(staffingList, null, 2));
    }
    setStaffingMode(mode);
  }

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      let parsedStaffing: Staffing[];
      if (staffingMode === "json") {
        try {
          parsedStaffing = JSON.parse(staffingJson);
          if (!Array.isArray(parsedStaffing)) {
            throw new Error();
          }
        } catch {
          setError("อัตรากำลังต้องเป็น JSON array ที่ถูกต้อง");
          return;
        }
      } else {
        parsedStaffing = staffingList;
      }

      const payload = {
        ...currentPolicy,
        status: "confirmed",
        version: currentPolicy.version || "v1.0",
        effectiveFrom: currentPolicy.effectiveFrom || "2020-01-01",
        effectiveTo: currentPolicy.effectiveTo || "2099-12-31",
        minRestHours: Number(minRestHours),
        maxConsecutiveDays: Number(maxConsecutiveDays),
        maxConsecutiveNights: Number(maxConsecutiveNights),
        maxConsecutiveOffDays: Number(maxConsecutiveOffDays),
        compressOffOnShortage: Boolean(compressOffOnShortage),
        allowOTOnShortage: Boolean(allowOTOnShortage),
        maxMonthlyHours: Number(maxMonthlyHours),
        maxContinuousHours: Number(maxContinuousHours),
        maxDoubleShifts: Number(maxDoubleShifts),
        nightStart: currentPolicy.nightStart ?? 1320,
        nightEnd: currentPolicy.nightEnd ?? 1800,
        fairnessHours: Number(fairnessHours),
        weights: {
          coverage: Number(wCoverage),
          fairness: Number(wFairness),
          preference: Number(wPreference),
          stability: Number(wStability),
        },
        targets,
        preferences: currentPolicy.preferences || [],
        staffing: parsedStaffing,
        staffingMode: currentPolicy.staffingMode ?? "legacy",
        weeklyStaffing: currentPolicy.weeklyStaffing ?? [],
      };

      await request(`/wards/${encodeURIComponent(roster.wardId)}/roster-policy`, token, "PUT", payload);
      const updated = await request<RosterResponse>(`/schedules/${roster.id}`, token);
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกนโยบายไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const activeStaffCount = roster.staff.filter((n) => n.active).length;

  return (
    <ModalFrame title="นโยบายและกฎเวร" onClose={onClose}>
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-[92vw] md:w-[66.67vw] max-w-6xl h-[75vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Cog6ToothIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                ตั้งค่านโยบายและเงื่อนไขการจัดเวร (Roster Policy) — แผนก: {roster.wardId}
              </h3>
              <p className="text-xs text-slate-400">
                กำหนดข้อบังคับความปลอดภัย (Hard Constraints) และอัตรากำลังขั้นต่ำในแต่ละเวร
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

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Quick Auto-Set Defaults Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-teal-50 border border-blue-200 rounded-2xl shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-[240px] flex-1">
              <span className="p-2 bg-blue-600 text-white rounded-xl text-base shadow-xs">⚡</span>
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>ตั้งค่าเริ่มต้นอัตโนมัติตามทีมพยาบาล</span>
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[10px] font-extrabold">
                    {activeStaffCount} คนพร้อมใช้งาน
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  คำนวณอัตรากำลังต่อผลัด, เติมเป้าหมายรายคน (160 ชม./8 วันหยุด) และรีเซ็ตกฎความปลอดภัยสากลในคลิกเดียว
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSetDefaultsFromStaff}
              disabled={busy}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <SparklesIcon className="h-4 w-4" />
              <span>Click Set Default</span>
            </button>
          </div>

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center justify-between gap-2 shadow-2xs animate-fade-in">
              <span>{successMsg}</span>
              <button
                type="button"
                onClick={() => setSuccessMsg("")}
                className="text-emerald-600 hover:text-emerald-900 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* 1. Time-based Staffing Requirements (Visual Builder) */}
          <fieldset className="border border-blue-200 rounded-2xl p-4 bg-blue-50/40">
            <legend className="text-xs font-bold text-blue-900 px-2 flex items-center justify-between w-full">
              <span className="flex items-center gap-1.5">
                <span>👥</span> กำหนดอัตรากำลังพยาบาลตามช่วงเวลา (Staffing Requirements)
              </span>
            </legend>

            <div className="mt-2 flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-blue-100">
              <p className="text-xs text-slate-600">
                กำหนดจำนวนพยาบาลวิชาชีพ (RN), พยาบาลเทคนิค/ผู้ช่วย (PN) และหัวหน้าเวรขั้นต่ำในแต่ละช่วงเวลา
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSetDefaultsFromStaff}
                  title="คำนวณอัตรากำลังตามจำนวนพยาบาลจริง"
                  className="px-2.5 py-1 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-bold transition shadow-2xs inline-flex items-center gap-1"
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>⚡ Set Default ({activeStaffCount} คน)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPresets("3shifts")}
                  className="px-2.5 py-1 text-xs bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold transition shadow-2xs inline-flex items-center gap-1"
                >
                  <span>3 เวรมาตรฐาน</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPresets("12h")}
                  className="px-2.5 py-1 text-xs bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold transition shadow-2xs inline-flex items-center gap-1"
                >
                  <span>2 เวร (12 ชม.)</span>
                </button>
                <div className="flex border border-slate-300 rounded-lg overflow-hidden text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => handleSwitchMode("visual")}
                    className={`px-2.5 py-1 ${staffingMode === "visual" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
                  >
                    แบบฟอร์ม
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchMode("json")}
                    className={`px-2.5 py-1 ${staffingMode === "json" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
                  >
                    JSON
                  </button>
                </div>
              </div>
            </div>

            {staffingMode === "visual" ? (
              <div className="mt-3 space-y-3">
                {staffingList.map((item, index) => {
                  const currentPreset = PRESET_PERIODS.find((p) => p.start === item.start && p.end === item.end);
                  const isCustom = !currentPreset;
                  const totalStaff = (item.rn || 0) + (item.pn || 0) + (item.leaders || 0);

                  return (
                    <div
                      key={index}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-3 transition hover:border-blue-300"
                    >
                      {/* Top row: Shift selector + Date scope + Delete */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <span>🕒</span> เวร:
                          </span>
                          <select
                            value={currentPreset ? `${item.start}-${item.end}` : "custom"}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val !== "custom") {
                                const [s, end] = val.split("-").map(Number);
                                handleUpdateStaffingRow(index, { start: s, end });
                              }
                            }}
                            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {PRESET_PERIODS.map((p) => (
                              <option key={`${p.start}-${p.end}`} value={`${p.start}-${p.end}`}>
                                {p.label}
                              </option>
                            ))}
                            {isCustom && (
                              <option value="custom">
                                กำหนดเวลาเอง ({minsToTimeString(item.start)} - {minsToTimeString(item.end)})
                              </option>
                            )}
                          </select>

                          {/* Date Scope */}
                          <div className="flex items-center gap-1.5 ml-1">
                            <span className="text-xs font-medium text-slate-500">วัน:</span>
                            {item.date ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={item.date}
                                  onChange={(e) => handleUpdateStaffingRow(index, { date: e.target.value })}
                                  className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStaffingRow(index, { date: "" })}
                                  className="text-xs text-slate-400 hover:text-slate-600"
                                  title="เปลี่ยนเป็นทุกวัน"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUpdateStaffingRow(index, { date: new Date().toISOString().split("T")[0] })}
                                className="px-2 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition"
                              >
                                ทุกวัน (คลิกเพื่อระบุวัน)
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            รวม {totalStaff} คน
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveStaffingRow(index)}
                            title="ลบช่วงเวลานี้"
                            className="text-slate-400 hover:text-rose-600 p-1 transition rounded-lg hover:bg-rose-50"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Custom Time Picker if isCustom */}
                      {isCustom && (
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <span className="font-bold text-slate-600">ระบุเวลา:</span>
                          <input
                            type="time"
                            value={minsToTimeString(item.start)}
                            onChange={(e) => {
                              const s = timeStringToMins(e.target.value);
                              handleUpdateStaffingRow(index, { start: s });
                            }}
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                          />
                          <span className="text-slate-400">ถึง</span>
                          <input
                            type="time"
                            value={minsToTimeString(item.end)}
                            onChange={(e) => {
                              const rawMins = timeStringToMins(e.target.value);
                              const endMins = rawMins <= item.start ? rawMins + 1440 : rawMins;
                              handleUpdateStaffingRow(index, { end: endMins });
                            }}
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                          />
                          {item.end > 1440 && (
                            <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                              (+1 วันถัดไป)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Headcount Inputs for RN, PN, Leader */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                        <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-200/60">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            👩‍⚕️ พยาบาล RN (วิชาชีพ)
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateStaffingRow(index, { rn: Math.max(0, (item.rn || 0) - 1) })}
                              className="w-7 h-7 bg-white border border-slate-300 rounded-md font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max="50"
                              value={item.rn}
                              onChange={(e) => handleUpdateStaffingRow(index, { rn: Math.max(0, Number(e.target.value)) })}
                              className="w-full text-center bg-white border border-slate-300 rounded-md py-1 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateStaffingRow(index, { rn: (item.rn || 0) + 1 })}
                              className="w-7 h-7 bg-white border border-slate-300 rounded-md font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-200/60">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            🧑‍⚕️ ผู้ช่วย PN / NA
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateStaffingRow(index, { pn: Math.max(0, (item.pn || 0) - 1) })}
                              className="w-7 h-7 bg-white border border-slate-300 rounded-md font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max="50"
                              value={item.pn}
                              onChange={(e) => handleUpdateStaffingRow(index, { pn: Math.max(0, Number(e.target.value)) })}
                              className="w-full text-center bg-white border border-slate-300 rounded-md py-1 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateStaffingRow(index, { pn: (item.pn || 0) + 1 })}
                              className="w-7 h-7 bg-white border border-slate-300 rounded-md font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-200/60">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            ⭐ หัวหน้าเวร (In-charge)
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateStaffingRow(index, { leaders: Math.max(0, (item.leaders || 0) - 1) })}
                              className="w-7 h-7 bg-white border border-slate-300 rounded-md font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={item.leaders}
                              onChange={(e) => handleUpdateStaffingRow(index, { leaders: Math.max(0, Number(e.target.value)) })}
                              className="w-full text-center bg-white border border-slate-300 rounded-md py-1 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateStaffingRow(index, { leaders: (item.leaders || 0) + 1 })}
                              className="w-7 h-7 bg-white border border-slate-300 rounded-md font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleAddStaffingRow}
                  className="w-full py-2.5 bg-white hover:bg-blue-50 text-blue-700 border border-dashed border-blue-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>+ เพิ่มช่วงเวลาเวร</span>
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <textarea
                  aria-label="อัตรากำลังตามช่วงเวลา JSON"
                  value={staffingJson}
                  onChange={(e) => setStaffingJson(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="[]"
                />
              </div>
            )}
          </fieldset>

          {/* 2 & 3. Hard Constraints and Solver Soft Weights (Side-by-Side on Desktop) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 2. Hard Constraints */}
            <fieldset className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 flex flex-col justify-between">
              <legend className="text-xs font-bold text-slate-800 px-2 flex items-center gap-1.5">
                <span>🔒</span> ข้อบังคับความปลอดภัย (Hard Constraints)
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    พักขั้นต่ำระหว่างเวร (ชม.):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="48"
                    step="0.5"
                    value={minRestHours}
                    onChange={(e) => setMinRestHours(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    วันทำงานติดต่อกันสูงสุด (วัน):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={maxConsecutiveDays}
                    onChange={(e) => setMaxConsecutiveDays(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    เวรดึกติดต่อกันสูงสุด (คืน):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="14"
                    value={maxConsecutiveNights}
                    onChange={(e) => setMaxConsecutiveNights(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    วันหยุดประจำ (OFF) ต่อเนื่องสูงสุด (วัน):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="14"
                    value={maxConsecutiveOffDays}
                    onChange={(e) => setMaxConsecutiveOffDays(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">มาตรฐาน 2 วัน (ไม่รวมวันลาที่ขออนุมัติ)</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชั่วโมงทำงานรวม/เดือนสูงสุด (ชม.):
                  </label>
                  <input
                    type="number"
                    min="40"
                    max="744"
                    value={maxMonthlyHours}
                    onChange={(e) => setMaxMonthlyHours(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชั่วโมงต่อเนื่องสูงสุด (ชม.):
                  </label>
                  <input
                    type="number"
                    min="8"
                    max="48"
                    value={maxContinuousHours}
                    onChange={(e) => setMaxContinuousHours(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    เวรควบสูงสุด/เดือน (ครั้ง):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="31"
                    value={maxDoubleShifts}
                    onChange={(e) => setMaxDoubleShifts(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Dynamic OFF Compression & Auto-OT Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                <label className="flex items-start gap-2.5 p-3 bg-blue-50/70 hover:bg-blue-50 border border-blue-200 rounded-xl cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={compressOffOnShortage}
                    onChange={(e) => setCompressOffOnShortage(e.target.checked)}
                    disabled={busy}
                    className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="block text-xs font-bold text-blue-950">
                      ⚡ ย่นวันหยุดเหลือ 1 วันเมื่อคนขาด
                    </span>
                    <span className="block text-[11px] text-blue-700">
                      ดึงคนที่พักครบ 1 วันกลับมาขึ้นเวรทันทีเมื่อเวรขาดคน ไม่ปล่อยให้ได้ OFF ติดกัน 2-3 วัน
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 bg-indigo-50/70 hover:bg-indigo-50 border border-indigo-200 rounded-xl cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={allowOTOnShortage}
                    onChange={(e) => setAllowOTOnShortage(e.target.checked)}
                    disabled={busy}
                    className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="block text-xs font-bold text-indigo-950">
                      💼 ยอมให้ทำ OT อัตโนมัติเมื่อคนไม่พอ
                    </span>
                    <span className="block text-[11px] text-indigo-700">
                      ยอมจัดเวรเพิ่ม (OT) เกินเป้าหมายรายคน เพื่อให้เวรทุกผลัดครบ 100%
                    </span>
                  </div>
                </label>
              </div>
            </fieldset>

            {/* 3. Soft Weights */}
            <fieldset className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 flex flex-col justify-between">
              <legend className="text-xs font-bold text-slate-800 px-2 flex items-center gap-1.5">
                <span>⚖️</span> น้ำหนักเป้าหมายของ Solver (Soft Weights: 0–1000)
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ความครบถ้วนอัตรากำลัง (Coverage):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={wCoverage}
                    onChange={(e) => setWCoverage(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ความเท่าเทียมชั่วโมงเวร (Fairness):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={wFairness}
                    onChange={(e) => setWFairness(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ความต้องการขอเวร/หยุด (Preference):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={wPreference}
                    onChange={(e) => setWPreference(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ความคงที่ของตาราง (Stability):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={wStability}
                    onChange={(e) => setWStability(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ส่วนต่างชั่วโมงสูงสุดที่ยอมรับได้ (Fairness Cap ชม.):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="168"
                    value={fairnessHours}
                    onChange={(e) => setFairnessHours(Number(e.target.value))}
                    disabled={busy}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </fieldset>
          </div>

          {/* 4. Individual Targets */}
          <fieldset className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
            <legend className="text-xs font-bold text-slate-800 px-2 flex items-center gap-1.5">
              <span>🎯</span> เป้าหมายรายบุคคล (Individual Targets)
            </legend>

            {/* Quick Batch Set All Controls */}
            <div className="mt-2 p-3 bg-white border border-blue-200 rounded-xl shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                  <span>⚡</span> ตั้งค่าเป้าหมายเท่ากันทุกคนในคลิกเดียว (Batch Set All):
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkHours(160);
                      setBulkOff(8);
                      setTargets((rows) => rows.map((r) => ({ ...r, hours: 160, off: 8 })));
                    }}
                    className="px-2.5 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold transition cursor-pointer"
                  >
                    160 ชม. / 8 วันหยุด
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkHours(176);
                      setBulkOff(8);
                      setTargets((rows) => rows.map((r) => ({ ...r, hours: 176, off: 8 })));
                    }}
                    className="px-2.5 py-1 text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-bold transition cursor-pointer"
                  >
                    176 ชม. / 8 วัน
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkHours(184);
                      setBulkOff(8);
                      setTargets((rows) => rows.map((r) => ({ ...r, hours: 184, off: 8 })));
                    }}
                    className="px-2.5 py-1 text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-bold transition cursor-pointer"
                  >
                    184 ชม. / 8 วัน
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                <span className="text-xs text-slate-500 font-medium">
                  กำหนดค่าให้พยาบาลทุกคน ({targets.length} คน):
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-500 font-semibold">ชม. รวม:</span>
                    <input
                      type="number"
                      min="0"
                      max="744"
                      value={bulkHours}
                      onChange={(e) => setBulkHours(Number(e.target.value))}
                      className="w-16 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-500 font-semibold">วันหยุด:</span>
                    <input
                      type="number"
                      min="0"
                      max="31"
                      value={bulkOff}
                      onChange={(e) => setBulkOff(Number(e.target.value))}
                      className="w-14 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTargets((rows) => rows.map((r) => ({ ...r, hours: Number(bulkHours), off: Number(bulkOff) })));
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-xs font-bold transition shadow-xs whitespace-nowrap cursor-pointer"
                  >
                    นำไปใช้กับทุกคน
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {targets.map((target, index) => {
                const nurse = roster.staff.find((n) => n.id === target.nurseId);
                return (
                  <div
                    key={target.nurseId}
                    className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-blue-200 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {nurse?.name ?? target.nurseId}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {target.nurseId} {nurse?.position ? `(${nurse.position})` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-medium">ชม:</span>
                        <input
                          type="number"
                          min="0"
                          max="744"
                          value={target.hours}
                          onChange={(e) =>
                            setTargets((rows) =>
                              rows.map((row, i) => (i === index ? { ...row, hours: Number(e.target.value) } : row))
                            )
                          }
                          className="w-14 border border-slate-300 rounded-lg px-1.5 py-1 text-xs text-slate-800 font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-medium">หยุด:</span>
                        <input
                          type="number"
                          min="0"
                          max="31"
                          value={target.off}
                          onChange={(e) =>
                            setTargets((rows) =>
                              rows.map((row, i) => (i === index ? { ...row, off: Number(e.target.value) } : row))
                            )
                          }
                          className="w-12 border border-slate-300 rounded-lg px-1.5 py-1 text-xs text-slate-800 font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-blue-600/20"
          >
            {busy ? "กำลังบันทึก..." : "💾 บันทึกเงื่อนไข"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
