"use client";
import { useState, useMemo } from "react";
import {
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
  SparklesIcon,
  CodeBracketIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  UsersIcon,
  ScaleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { request } from "@/lib/api";
import type { Roster, RosterResponse } from "@/types/schedule";

type Target = { nurseId: string; hours: number; off: number; quotas: Record<string, number> };
type Staffing = { date: string; start: number; end: number; rn: number; pn: number; leaders: number; skills: Record<string, number> };

interface PolicyPanelProps {
  roster: Roster;
  token: string;
  onSaved: (updated: RosterResponse) => void;
  onBackToGrid?: () => void;
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

const COMMON_TIME_OPTIONS = [
  { mins: 0, label: "00.00 น. (เที่ยงคืน)" },
  { mins: 60, label: "01.00 น. (ตี 1)" },
  { mins: 120, label: "02.00 น. (ตี 2)" },
  { mins: 180, label: "03.00 น. (ตี 3)" },
  { mins: 240, label: "04.00 น. (ตี 4)" },
  { mins: 300, label: "05.00 น. (ตี 5)" },
  { mins: 360, label: "06.00 น. (6 โมงเช้า)" },
  { mins: 420, label: "07.00 น. (7 โมงเช้า)" },
  { mins: 450, label: "07.30 น. (7 โมงครึ่ง)" },
  { mins: 480, label: "08.00 น. (8 โมงเช้า / เวรเช้า)" },
  { mins: 510, label: "08.30 น. (8 โมงครึ่ง)" },
  { mins: 540, label: "09.00 น. (9 โมงเช้า)" },
  { mins: 600, label: "10.00 น. (10 โมงเช้า)" },
  { mins: 660, label: "11.00 น. (11 โมง)" },
  { mins: 720, label: "12.00 น. (เที่ยงวัน)" },
  { mins: 780, label: "13.00 น. (บ่ายโมง)" },
  { mins: 840, label: "14.00 น. (บ่าย 2)" },
  { mins: 900, label: "15.00 น. (บ่าย 3)" },
  { mins: 960, label: "16.00 น. (4 โมงเย็น / เวรบ่าย)" },
  { mins: 990, label: "16.30 น. (4 โมงครึ่ง)" },
  { mins: 1020, label: "17.00 น. (5 โมงเย็น)" },
  { mins: 1080, label: "18.00 น. (6 โมงเย็น)" },
  { mins: 1140, label: "19.00 น. (1 ทุ่ม)" },
  { mins: 1200, label: "20.00 น. (2 ทุ่ม / เวรดึก 12 ชม.)" },
  { mins: 1260, label: "21.00 น. (3 ทุ่ม)" },
  { mins: 1320, label: "22.00 น. (4 ทุ่ม)" },
  { mins: 1380, label: "23.00 น. (5 ทุ่ม)" },
  { mins: 1440, label: "24.00 น. (เที่ยงคืน)" },
  { mins: 1920, label: "08.00 น. (8 โมงเช้า วันถัดไป)" },
];

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

export function PolicyPanel({ roster, token, onSaved, onBackToGrid }: PolicyPanelProps) {
  const currentPolicy = roster.policy || {};
  const policyAny = currentPolicy as unknown as { targets?: Target[]; staffing?: Staffing[] };

  // 1. Hard Constraints
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

  // 2. Staffing Requirements
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

  // 3. Soft Weights
  const [wCoverage, setWCoverage] = useState(currentPolicy.weights?.coverage ?? 100);
  const [wFairness, setWFairness] = useState(currentPolicy.weights?.fairness ?? 50);
  const [wPreference, setWPreference] = useState(currentPolicy.weights?.preference ?? 20);
  const [wStability, setWStability] = useState(currentPolicy.weights?.stability ?? 10);

  // 4. Individual Targets
  const [targets, setTargets] = useState<Target[]>(() =>
    roster.staff.filter((n) => n.active).map((n) => policyAny.targets?.find((t: Target) => t.nurseId === n.id) ?? { nurseId: n.id, hours: 160, off: 8, quotas: {} })
  );

  // Targets Filter & Search
  const [targetTab, setTargetTab] = useState<"all" | "rn" | "pn">("all");
  const [targetQuery, setTargetQuery] = useState("");

  // Batch Set Values
  const [bulkHoursRN, setBulkHoursRN] = useState(160);
  const [bulkOffRN, setBulkOffRN] = useState(8);
  const [bulkHoursPN, setBulkHoursPN] = useState(160);
  const [bulkOffPN, setBulkOffPN] = useState(8);

  // Quota Modal State
  const [quotaEditingNurseId, setQuotaEditingNurseId] = useState<string | null>(null);

  // Action states
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const activeStaff = useMemo(() => roster.staff.filter((n) => n.active), [roster.staff]);
  const rnStaff = useMemo(() => activeStaff.filter((n) => n.position === "RN" || n.position !== "PN"), [activeStaff]);
  const pnStaff = useMemo(() => activeStaff.filter((n) => n.position === "PN"), [activeStaff]);

  function syncListToJson(list: Staffing[]) {
    setStaffingList(list);
    setStaffingJson(JSON.stringify(list, null, 2));
  }

  function handleSetDefaultsFromStaff() {
    const totalN = activeStaff.length;
    const numRN = rnStaff.length;
    const numPN = pnStaff.length;
    const numLeaders = activeStaff.filter((n) => n.leader).length;

    if (totalN === 0) {
      setError("ไม่พบบุคลากรที่มีสถานะใช้งานในวอร์ดนี้");
      return;
    }

    let calculatedStaffing: Staffing[];

    if (totalN <= 4) {
      calculatedStaffing = [
        { date: "", start: 480, end: 960, rn: Math.min(1, numRN), pn: numRN > 0 ? 0 : Math.min(1, numPN), leaders: Math.min(1, numLeaders), skills: {} },
        { date: "", start: 960, end: 1440, rn: Math.min(1, numRN), pn: 0, leaders: 0, skills: {} },
        { date: "", start: 0, end: 480, rn: Math.min(1, numRN), pn: 0, leaders: 0, skills: {} },
      ];
    } else if (totalN <= 7) {
      calculatedStaffing = [
        { date: "", start: 480, end: 960, rn: Math.max(1, Math.min(2, numRN)), pn: numPN > 0 ? 1 : 0, leaders: Math.min(1, numLeaders), skills: {} },
        { date: "", start: 960, end: 1440, rn: 1, pn: 0, leaders: numLeaders >= 2 ? 1 : 0, skills: {} },
        { date: "", start: 0, end: 480, rn: 1, pn: 0, leaders: numLeaders >= 3 ? 1 : 0, skills: {} },
      ];
    } else if (totalN <= 12) {
      calculatedStaffing = [
        { date: "", start: 480, end: 960, rn: Math.max(1, Math.min(2, numRN)), pn: numPN > 0 ? 1 : 0, leaders: Math.min(1, numLeaders), skills: {} },
        { date: "", start: 960, end: 1440, rn: Math.max(1, Math.min(2, numRN)), pn: numPN >= 2 ? 1 : 0, leaders: numLeaders >= 2 ? 1 : 0, skills: {} },
        { date: "", start: 0, end: 480, rn: 1, pn: numPN >= 3 ? 1 : 0, leaders: numLeaders >= 3 ? 1 : 0, skills: {} },
      ];
    } else {
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

    // Default targets
    setTargets(activeStaff.map((n) => ({
      nurseId: n.id,
      hours: 160,
      off: 8,
      quotas: {},
    })));

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
    setSuccessMsg(`✨ คำนวณอัตรากำลังเริ่มต้นสำเร็จตามจำนวนบุคลากร ${totalN} คน (RN: ${numRN}, PN: ${numPN}, หัวหน้าเวร: ${numLeaders})`);
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
        // keep current
      }
    } else {
      setStaffingJson(JSON.stringify(staffingList, null, 2));
    }
    setStaffingMode(mode);
  }

  // Batch set for RN
  function handleBatchRN(hours: number, off: number) {
    const rnIds = new Set(rnStaff.map((n) => n.id));
    setTargets((prev) =>
      prev.map((t) => (rnIds.has(t.nurseId) ? { ...t, hours, off } : t))
    );
    setSuccessMsg(`⚡ กำหนดค่าเป้าหมาย ${hours} ชม. / ${off} วัน OFF ให้พยาบาลวิชาชีพ (RN) ทั้งหมด ${rnStaff.length} คนเรียบร้อยแล้ว`);
  }

  // Batch set for PN
  function handleBatchPN(hours: number, off: number) {
    const pnIds = new Set(pnStaff.map((n) => n.id));
    setTargets((prev) =>
      prev.map((t) => (pnIds.has(t.nurseId) ? { ...t, hours, off } : t))
    );
    setSuccessMsg(`⚡ กำหนดค่าเป้าหมาย ${hours} ชม. / ${off} วัน OFF ให้ผู้ช่วยพยาบาล (PN) ทั้งหมด ${pnStaff.length} คนเรียบร้อยแล้ว`);
  }

  function handleUpdateTarget(nurseId: string, changes: Partial<Target>) {
    setTargets((prev) =>
      prev.map((t) => (t.nurseId === nurseId ? { ...t, ...changes } : t))
    );
  }

  async function handleSave() {
    setBusy(true);
    setError("");
    setSuccessMsg("");
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
      };

      await request(`/wards/${encodeURIComponent(roster.wardId)}/roster-policy`, token, "PUT", payload);
      const updated = await request<RosterResponse>(`/schedules/${roster.id}`, token);
      onSaved(updated);
      setSuccessMsg("💾 บันทึกนโยบายและเงื่อนไขการจัดเวรเรียบร้อยแล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกนโยบายไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // Filtered staff for display
  const displayedStaff = useMemo(() => {
    let list = activeStaff;
    if (targetTab === "rn") list = rnStaff;
    if (targetTab === "pn") list = pnStaff;

    if (targetQuery.trim()) {
      const q = targetQuery.trim().toLowerCase();
      list = list.filter((n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    }
    return list;
  }, [activeStaff, rnStaff, pnStaff, targetTab, targetQuery]);

  const editingNurse = useMemo(() => {
    if (!quotaEditingNurseId) return null;
    return activeStaff.find((n) => n.id === quotaEditingNurseId) || null;
  }, [quotaEditingNurseId, activeStaff]);

  const editingTarget = useMemo(() => {
    if (!quotaEditingNurseId) return null;
    return targets.find((t) => t.nurseId === quotaEditingNurseId) || { nurseId: quotaEditingNurseId, hours: 160, off: 8, quotas: {} };
  }, [quotaEditingNurseId, targets]);

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Cog6ToothIcon className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">ตั้งค่านโยบายและเงื่อนไขการจัดเวร (Roster Policy)</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-100 text-indigo-800">
                  แผนก {roster.wardId}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                กำหนดข้อบังคับความปลอดภัยขั้นต่ำ, อัตรากำลังตามผลัด, และเป้าหมายชั่วโมงรายบุคคลแยก RN / PN
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onBackToGrid && (
              <button
                type="button"
                onClick={onBackToGrid}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>← กลับหน้าตารางเวร</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <span>💾</span>}
              <span>บันทึกนโยบาย</span>
            </button>
          </div>
        </div>

        {/* Alerts Bar */}
        {error && (
          <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-rose-600 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
            <button type="button" onClick={() => setError("")} className="text-rose-500 font-bold px-1.5">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="font-semibold">{successMsg}</span>
            </div>
            <button type="button" onClick={() => setSuccessMsg("")} className="text-emerald-500 font-bold px-1.5">✕</button>
          </div>
        )}

        {/* Quick Auto-Set Defaults Banner */}
        <div className="p-4 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-purple-50/80 border border-blue-200 rounded-2xl flex items-center justify-between flex-wrap gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-blue-950">คำนวณอัตรากำลังเริ่มต้นอัตโนมัติ (Auto Balance from Team)</div>
              <div className="text-[11px] text-blue-700 mt-0.5">
                มีบุคลากรใช้งาน {activeStaff.length} คน (RN: {rnStaff.length} คน, PN: {pnStaff.length} คน, หัวหน้าเวร: {activeStaff.filter(n => n.leader).length} คน)
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSetDefaultsFromStaff}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>คำนวณอัตรากำลังเริ่มต้น</span>
          </button>
        </div>
      </div>

      {/* 2. Staffing Requirements (Section 1) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">1. ความต้องการอัตรากำลังตามช่วงเวลา (Staffing Requirements)</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-xl p-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => handleApplyPresets("3shifts")}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 rounded-lg transition hover:bg-white cursor-pointer"
              >
                มาตรฐาน 3 ผลัด (ช/บ/ด)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPresets("12h")}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 rounded-lg transition hover:bg-white cursor-pointer"
              >
                ผลัด 12 ชม.
              </button>
            </div>
            <div className="flex items-center bg-slate-100 rounded-xl p-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => handleSwitchMode("visual")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${staffingMode === "visual" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600"}`}
              >
                โหมดตาราง (Visual)
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode("json")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${staffingMode === "json" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600"}`}
              >
                <CodeBracketIcon className="w-3.5 h-3.5 inline mr-1" />
                JSON
              </button>
            </div>
          </div>
        </div>

        {staffingMode === "visual" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {staffingList.map((item, index) => {
                const startTimeStr = minsToTimeString(item.start);
                const endTimeStr = minsToTimeString(item.end);
                const isNextDay = item.end > 1440;
                const hoursDuration = (item.end - item.start) / 60;

                return (
                  <div key={index} className="p-4 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-3 shadow-2xs hover:border-blue-300 transition">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 text-xs font-black flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span>{hoursDuration === 8 ? "ผลัด 8 ชม." : hoursDuration === 12 ? "ผลัด 12 ชม." : `ผลัด ${hoursDuration} ชม.`}</span>
                            {item.end >= 1440 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded">
                                ข้ามวัน (+1)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-medium text-blue-700">
                            {formatThaiSpoken(item.start)} ({minsToTimeString(item.start)} น.) → {formatThaiSpoken(item.end)} ({minsToTimeString(item.end)} น.{item.end >= 1440 ? " วันถัดไป" : ""})
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveStaffingRow(index)}
                        className="text-slate-400 hover:text-rose-600 transition p-1 rounded-lg hover:bg-rose-50 cursor-pointer"
                        title="ลบช่วงเวลานี้"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          ⏰ เวลาเริ่ม (Start Time):
                        </label>
                        <select
                          value={item.start}
                          onChange={(e) => handleUpdateStaffingRow(index, { start: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                        >
                          {COMMON_TIME_OPTIONS.filter((opt) => opt.mins < 1440).map((opt) => (
                            <option key={opt.mins} value={opt.mins}>
                              {opt.label}
                            </option>
                          ))}
                          {!COMMON_TIME_OPTIONS.some((opt) => opt.mins === item.start) && (
                            <option value={item.start}>
                              {formatThaiTimeLabel(item.start)}
                            </option>
                          )}
                        </select>
                        <div className="mt-1 px-2 py-0.5 bg-blue-50/80 border border-blue-100 rounded-lg text-[10px] font-bold text-blue-800 flex items-center justify-between">
                          <span>☀️ {formatThaiSpoken(item.start)}</span>
                          <span className="font-mono text-slate-500">{minsToTimeString(item.start)} น.</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          ⏰ เวลาสิ้นสุด (End Time):
                        </label>
                        <select
                          value={item.end}
                          onChange={(e) => handleUpdateStaffingRow(index, { end: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                        >
                          {COMMON_TIME_OPTIONS.map((opt) => (
                            <option key={opt.mins} value={opt.mins}>
                              {opt.label}
                            </option>
                          ))}
                          {!COMMON_TIME_OPTIONS.some((opt) => opt.mins === item.end) && (
                            <option value={item.end}>
                              {formatThaiTimeLabel(item.end, item.end >= 1440)}
                            </option>
                          )}
                        </select>
                        <div className="mt-1 px-2 py-0.5 bg-indigo-50/80 border border-indigo-100 rounded-lg text-[10px] font-bold text-indigo-800 flex items-center justify-between">
                          <span>🌙 {formatThaiSpoken(item.end)}</span>
                          <span className="font-mono text-slate-500">
                            {minsToTimeString(item.end)} น.{item.end >= 1440 ? " (วันถัดไป)" : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-center">
                      <div className="bg-white p-2 rounded-xl border border-blue-100">
                        <span className="block text-[10px] font-bold text-blue-700 mb-1">RN (พยาบาล)</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={item.rn}
                          onChange={(e) => handleUpdateStaffingRow(index, { rn: Math.max(0, Number(e.target.value)) })}
                          className="w-full text-center bg-blue-50/50 border border-blue-200 rounded-lg py-1 text-xs font-black text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-emerald-100">
                        <span className="block text-[10px] font-bold text-emerald-700 mb-1">PN (ผู้ช่วย)</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={item.pn}
                          onChange={(e) => handleUpdateStaffingRow(index, { pn: Math.max(0, Number(e.target.value)) })}
                          className="w-full text-center bg-emerald-50/50 border border-emerald-200 rounded-lg py-1 text-xs font-black text-emerald-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-amber-100">
                        <span className="block text-[10px] font-bold text-amber-700 mb-1">Leader (หัวหน้า)</span>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={item.leaders}
                          onChange={(e) => handleUpdateStaffingRow(index, { leaders: Math.max(0, Number(e.target.value)) })}
                          className="w-full text-center bg-amber-50/50 border border-amber-200 rounded-lg py-1 text-xs font-black text-amber-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddStaffingRow}
              className="w-full py-2.5 bg-slate-50 hover:bg-blue-50 text-blue-700 border border-dashed border-blue-300 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="h-4 w-4" />
              <span>+ เพิ่มช่วงเวลาเวร</span>
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <textarea
              aria-label="อัตรากำลังตามช่วงเวลา JSON"
              value={staffingJson}
              onChange={(e) => setStaffingJson(e.target.value)}
              rows={8}
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 p-4 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="[]"
            />
          </div>
        )}
      </div>

      {/* 3. Hard Constraints & Soft Weights (Section 2 - 2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hard Constraints */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <ShieldCheckIcon className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-bold text-slate-800">2. ข้อบังคับความปลอดภัย (Hard Constraints)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">พักขั้นต่ำระหว่างเวร (ชม.):</label>
              <input
                type="number"
                min="0"
                max="48"
                step="0.5"
                value={minRestHours}
                onChange={(e) => setMinRestHours(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">เช่น 8 ชม. ห้ามจัดดึกต่อเช้า</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">วันทำงานติดต่อกันสูงสุด (วัน):</label>
              <input
                type="number"
                min="1"
                max="31"
                value={maxConsecutiveDays}
                onChange={(e) => setMaxConsecutiveDays(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">มาตรฐานกระทรวง 6 วัน</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">เวรดึกติดต่อกันสูงสุด (คืน):</label>
              <input
                type="number"
                min="1"
                max="14"
                value={maxConsecutiveNights}
                onChange={(e) => setMaxConsecutiveNights(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">มาตรฐาน 3 คืนติดต่อกัน</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">วันหยุดประจำ (OFF) ต่อเนื่องสูงสุด (วัน):</label>
              <input
                type="number"
                min="1"
                max="14"
                value={maxConsecutiveOffDays}
                onChange={(e) => setMaxConsecutiveOffDays(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">มาตรฐาน 2 วัน (ไม่รวมวันลาที่ขออนุมัติ)</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">ชั่วโมงรวมสูงสุด/เดือน (ชม.):</label>
              <input
                type="number"
                min="40"
                max="744"
                value={maxMonthlyHours}
                onChange={(e) => setMaxMonthlyHours(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">เพดานรวม OT ไม่เกิน 240 ชม.</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">ชั่วโมงต่อเนื่องสูงสุด (ชม.):</label>
              <input
                type="number"
                min="8"
                max="48"
                value={maxContinuousHours}
                onChange={(e) => setMaxContinuousHours(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">เวรควบสูงสุด 16 ชม.</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">เวรควบสูงสุด/เดือน (ครั้ง):</label>
              <input
                type="number"
                min="0"
                max="31"
                value={maxDoubleShifts}
                onChange={(e) => setMaxDoubleShifts(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">จำกัดเวรควบไม่เกิน 8 ครั้ง</span>
            </div>
          </div>

          {/* Dynamic OFF Compression & Auto-OT Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-slate-100">
            <label className="flex items-start gap-3 p-3.5 bg-blue-50/60 hover:bg-blue-50 border border-blue-200 rounded-2xl cursor-pointer transition">
              <input
                type="checkbox"
                checked={compressOffOnShortage}
                onChange={(e) => setCompressOffOnShortage(e.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="block text-xs font-bold text-blue-950">
                  ⚡ ย่นวันหยุดเหลือ 1 วันเมื่อเวรขาดคน (Auto-Recall from 1-Day OFF)
                </span>
                <span className="block text-[11px] text-blue-700 leading-relaxed">
                  หากวันใดเวรขาดคน ระบบจะดึงบุคลากรที่พักครบ 1 วันกลับมาขึ้นเวรทันที ป้องกันการได้ OFF ติดกัน 2–3 วันขณะเวรขาด
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 bg-indigo-50/60 hover:bg-indigo-50 border border-indigo-200 rounded-2xl cursor-pointer transition">
              <input
                type="checkbox"
                checked={allowOTOnShortage}
                onChange={(e) => setAllowOTOnShortage(e.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="block text-xs font-bold text-indigo-950">
                  💼 ยอมให้ทำ OT อัตโนมัติเมื่อคนไม่พอ (Allow OT on Deficit)
                </span>
                <span className="block text-[11px] text-indigo-700 leading-relaxed">
                  ยอมให้จัดเวรเพิ่ม (OT) เกินชั่วโมงมาตรฐาน เพื่อให้เวรทุกผลัดครบ 100% (จำกัดไม่เกินเพดาน 240 ชม.)
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Soft Weights */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <ScaleIcon className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">3. น้ำหนักเป้าหมาย Solver (Soft Weights: 0–1000)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">ความครบถ้วนอัตรากำลัง (Coverage):</label>
              <input
                type="number"
                min="0"
                max="1000"
                value={wCoverage}
                onChange={(e) => setWCoverage(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">ความสำคัญอันดับสูงสุด (100)</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">ความเท่าเทียมชั่วโมงเวร (Fairness):</label>
              <input
                type="number"
                min="0"
                max="1000"
                value={wFairness}
                onChange={(e) => setWFairness(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">เกลี่ยชั่วโมงให้ใกล้เคียงกัน (50)</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">ความพึงพอใจการขอเวร (Preference):</label>
              <input
                type="number"
                min="0"
                max="1000"
                value={wPreference}
                onChange={(e) => setWPreference(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">ความต้องการขอหยุด/ขึ้นเวร (20)</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">ความคงที่ของตาราง (Stability):</label>
              <input
                type="number"
                min="0"
                max="1000"
                value={wStability}
                onChange={(e) => setWStability(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">เปลี่ยนเวรจากร่างเดิมน้อยที่สุด (10)</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">ส่วนต่างชั่วโมงสูงสุดที่ยอมรับได้ (Fairness Cap ชม.):</label>
              <input
                type="number"
                min="0"
                max="168"
                value={fairnessHours}
                onChange={(e) => setFairnessHours(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">ส่วนต่างชั่วโมงระหว่างคนที่ได้มากสุดกับน้อยสุด (48 ชม.)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Individual Targets Separated by RN & PN (Section 4 ⭐) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black">
              🎯
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">4. เป้าหมายชั่วโมงและวันหยุดรายบุคคล (Individual Targets)</h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  ทั้งหมด {activeStaff.length} คน
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                แยกตั้งค่าชั่วโมงเป้าหมายและวัน OFF ขั้นต่ำ ระหว่างพยาบาลวิชาชีพ (RN) และผู้ช่วยพยาบาล (PN) อย่างอิสระ
              </p>
            </div>
          </div>

          {/* Sub-Tabs & Live Search */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center bg-slate-100 rounded-2xl p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setTargetTab("all")}
                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${targetTab === "all" ? "bg-white text-blue-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"}`}
              >
                ทั้งหมด ({activeStaff.length})
              </button>
              <button
                type="button"
                onClick={() => setTargetTab("rn")}
                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${targetTab === "rn" ? "bg-blue-600 text-white shadow-xs font-black" : "text-blue-700 hover:text-blue-950"}`}
              >
                <span>🔵 RN ({rnStaff.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetTab("pn")}
                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${targetTab === "pn" ? "bg-emerald-600 text-white shadow-xs font-black" : "text-emerald-700 hover:text-emerald-950"}`}
              >
                <span>🟢 PN ({pnStaff.length})</span>
              </button>
            </div>

            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ / รหัส..."
                value={targetQuery}
                onChange={(e) => setTargetQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
              />
            </div>
          </div>
        </div>

        {/* GROUP 1: RN Registered Nurses (Card) */}
        {(targetTab === "all" || targetTab === "rn") && (
          <div className="p-5 bg-gradient-to-r from-blue-50/50 via-white to-blue-50/30 border border-blue-200 rounded-3xl space-y-4 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-blue-100">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-blue-600" />
                <span className="text-xs font-black text-blue-950">
                  กลุ่มพยาบาลวิชาชีพ (RN / Registered Nurses & Leaders)
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {rnStaff.length} คน
                </span>
              </div>

              {/* Quick Batch for RN */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-[11px] font-bold text-blue-900">⚡ ตั้งค่าด่วนเฉพาะ RN:</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500">ชม:</span>
                  <input
                    type="number"
                    value={bulkHoursRN}
                    onChange={(e) => setBulkHoursRN(Number(e.target.value))}
                    className="w-16 bg-white border border-blue-300 rounded-lg px-2 py-0.5 text-xs text-center font-bold text-blue-950"
                  />
                  <span className="text-[10px] text-slate-500">OFF:</span>
                  <input
                    type="number"
                    value={bulkOffRN}
                    onChange={(e) => setBulkOffRN(Number(e.target.value))}
                    className="w-14 bg-white border border-blue-300 rounded-lg px-2 py-0.5 text-xs text-center font-bold text-blue-950"
                  />
                  <button
                    type="button"
                    onClick={() => handleBatchRN(bulkHoursRN, bulkOffRN)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition shadow-2xs cursor-pointer"
                  >
                    ▶ กำหนดให้ RN ทุกคน
                  </button>
                </div>
                <div className="flex items-center gap-1 pl-2 border-l border-blue-200">
                  <button
                    type="button"
                    onClick={() => handleBatchRN(160, 8)}
                    className="px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold transition cursor-pointer"
                  >
                    160ชม./8วัน
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchRN(176, 8)}
                    className="px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold transition cursor-pointer"
                  >
                    176ชม./8วัน
                  </button>
                </div>
              </div>
            </div>

            {/* RN Table */}
            <div className="overflow-x-auto rounded-2xl border border-blue-100 bg-white shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-blue-50/60 text-blue-900 border-b border-blue-100">
                    <th className="p-3 w-12 text-center font-bold">#</th>
                    <th className="p-3 font-bold">รายชื่อเจ้าหน้าที่</th>
                    <th className="p-3 font-bold w-40">ตำแหน่ง / ทักษะ</th>
                    <th className="p-3 font-bold w-36 text-center">ชั่วโมงเป้าหมาย (ชม.)</th>
                    <th className="p-3 font-bold w-36 text-center">วัน OFF ขั้นต่ำ (วัน)</th>
                    <th className="p-3 font-bold w-32 text-center">โควตาเวรเฉพาะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedStaff
                    .filter((n) => n.position === "RN" || n.position !== "PN")
                    .map((nurse, i) => {
                      const t = targets.find((x) => x.nurseId === nurse.id) || { nurseId: nurse.id, hours: 160, off: 8, quotas: {} };
                      const hasQuotas = t.quotas && Object.keys(t.quotas).length > 0;

                      return (
                        <tr key={nurse.id} className="hover:bg-blue-50/30 transition">
                          <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{i + 1}</td>
                          <td className="p-3 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <span>{nurse.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">({nurse.id})</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 text-blue-800">
                                RN
                              </span>
                              {nurse.leader && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-800 flex items-center gap-0.5">
                                  <span>👑</span> หัวหน้าเวร
                                </span>
                              )}
                              {nurse.double && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 font-bold">
                                  เวรควบได้
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max="744"
                              value={t.hours}
                              onChange={(e) => handleUpdateTarget(nurse.id, { hours: Number(e.target.value) })}
                              className="w-24 text-center bg-slate-50 border border-slate-300 rounded-xl py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max="31"
                              value={t.off}
                              onChange={(e) => handleUpdateTarget(nurse.id, { off: Number(e.target.value) })}
                              className="w-20 text-center bg-slate-50 border border-slate-300 rounded-xl py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setQuotaEditingNurseId(nurse.id)}
                              className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                                hasQuotas
                                  ? "bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {hasQuotas ? `ตั้งแล้ว (${Object.keys(t.quotas).length})` : "+ โควตาเวร"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* GROUP 2: PN Practical Nurses (Card) */}
        {(targetTab === "all" || targetTab === "pn") && (
          <div className="p-5 bg-gradient-to-r from-emerald-50/50 via-white to-emerald-50/30 border border-emerald-200 rounded-3xl space-y-4 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-emerald-100">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-600" />
                <span className="text-xs font-black text-emerald-950">
                  กลุ่มผู้ช่วยพยาบาล (PN / Practical Nurses)
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {pnStaff.length} คน
                </span>
              </div>

              {/* Quick Batch for PN */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-[11px] font-bold text-emerald-900">⚡ ตั้งค่าด่วนเฉพาะ PN:</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500">ชม:</span>
                  <input
                    type="number"
                    value={bulkHoursPN}
                    onChange={(e) => setBulkHoursPN(Number(e.target.value))}
                    className="w-16 bg-white border border-emerald-300 rounded-lg px-2 py-0.5 text-xs text-center font-bold text-emerald-950"
                  />
                  <span className="text-[10px] text-slate-500">OFF:</span>
                  <input
                    type="number"
                    value={bulkOffPN}
                    onChange={(e) => setBulkOffPN(Number(e.target.value))}
                    className="w-14 bg-white border border-emerald-300 rounded-lg px-2 py-0.5 text-xs text-center font-bold text-emerald-950"
                  />
                  <button
                    type="button"
                    onClick={() => handleBatchPN(bulkHoursPN, bulkOffPN)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition shadow-2xs cursor-pointer"
                  >
                    ▶ กำหนดให้ PN ทุกคน
                  </button>
                </div>
                <div className="flex items-center gap-1 pl-2 border-l border-emerald-200">
                  <button
                    type="button"
                    onClick={() => handleBatchPN(160, 8)}
                    className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold transition cursor-pointer"
                  >
                    160ชม./8วัน
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchPN(184, 8)}
                    className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold transition cursor-pointer"
                  >
                    184ชม./8วัน
                  </button>
                </div>
              </div>
            </div>

            {/* PN Table */}
            <div className="overflow-x-auto rounded-2xl border border-emerald-100 bg-white shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-emerald-50/60 text-emerald-900 border-b border-emerald-100">
                    <th className="p-3 w-12 text-center font-bold">#</th>
                    <th className="p-3 font-bold">รายชื่อเจ้าหน้าที่</th>
                    <th className="p-3 font-bold w-40">ตำแหน่ง</th>
                    <th className="p-3 font-bold w-36 text-center">ชั่วโมงเป้าหมาย (ชม.)</th>
                    <th className="p-3 font-bold w-36 text-center">วัน OFF ขั้นต่ำ (วัน)</th>
                    <th className="p-3 font-bold w-32 text-center">โควตาเวรเฉพาะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedStaff
                    .filter((n) => n.position === "PN")
                    .map((nurse, i) => {
                      const t = targets.find((x) => x.nurseId === nurse.id) || { nurseId: nurse.id, hours: 160, off: 8, quotas: {} };
                      const hasQuotas = t.quotas && Object.keys(t.quotas).length > 0;

                      return (
                        <tr key={nurse.id} className="hover:bg-emerald-50/30 transition">
                          <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{i + 1}</td>
                          <td className="p-3 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <span>{nurse.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">({nurse.id})</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                              PN (ผู้ช่วยพยาบาล)
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max="744"
                              value={t.hours}
                              onChange={(e) => handleUpdateTarget(nurse.id, { hours: Number(e.target.value) })}
                              className="w-24 text-center bg-slate-50 border border-slate-300 rounded-xl py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max="31"
                              value={t.off}
                              onChange={(e) => handleUpdateTarget(nurse.id, { off: Number(e.target.value) })}
                              className="w-20 text-center bg-slate-50 border border-slate-300 rounded-xl py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setQuotaEditingNurseId(nurse.id)}
                              className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                                hasQuotas
                                  ? "bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {hasQuotas ? `ตั้งแล้ว (${Object.keys(t.quotas).length})` : "+ โควตาเวร"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 5. Sticky Bottom Action Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-lg flex items-center justify-between flex-wrap gap-3 sticky bottom-4">
        <div className="text-xs text-slate-500 font-medium">
          💡 ตรวจสอบเงื่อนไขครบแล้ว อย่าลืมกดบันทึกนโยบายเพื่อให้ระบบ Solver และตารางเวรนำไปใช้งาน
        </div>

        <div className="flex items-center gap-2">
          {onBackToGrid && (
            <button
              type="button"
              onClick={onBackToGrid}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              ยกเลิก / กลับหน้าตาราง
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <span>💾</span>}
            <span>บันทึกนโยบายการจัดเวร</span>
          </button>
        </div>
      </div>

      {/* Quota Modal Overlay */}
      {editingNurse && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-800">โควตาเวรเฉพาะรายบุคคล</h4>
                <p className="text-xs text-slate-500">{editingNurse.name} ({editingNurse.position})</p>
              </div>
              <button
                type="button"
                onClick={() => setQuotaEditingNurseId(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-slate-500">
                กำหนดจำนวนเวรสูงสุดต่อเดือนสำหรับแต่ละประเภทเวร (เว้นว่างไว้หากไม่จำกัด):
              </p>
              <div className="grid grid-cols-2 gap-2">
                {roster.shifts
                  .filter((s) => s.code !== "X" && s.code !== "L" && s.code !== "" && s.code !== "?" && s.code !== "??" && s.code !== "???")
                  .map((sh, shIdx) => {
                    const currentVal = editingTarget?.quotas?.[sh.code] ?? "";
                    return (
                      <div key={`${sh.code}_${shIdx}`} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">{sh.name || sh.code}:</span>
                        <input
                          type="number"
                          min="0"
                          max="31"
                          placeholder="ไม่จำกัด"
                          value={currentVal}
                          onChange={(e) => {
                            const val = e.target.value === "" ? undefined : Number(e.target.value);
                            const updatedQuotas = { ...(editingTarget?.quotas || {}) };
                            if (val === undefined) {
                              delete updatedQuotas[sh.code];
                            } else {
                              updatedQuotas[sh.code] = val;
                            }
                            handleUpdateTarget(editingNurse.id, { quotas: updatedQuotas });
                          }}
                          className="w-18 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setQuotaEditingNurseId(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
