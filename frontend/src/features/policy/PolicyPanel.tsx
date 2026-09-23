"use client";
import { useState, useMemo } from "react";
import "./policy.css";
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
} from "@heroicons/react/24/outline";
import { PolicyFieldHelp } from "./PolicyHelp";
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

function isStaffingList(value: unknown): value is Staffing[] {
  return Array.isArray(value) && value.every(item => {
    if (!item || typeof item !== "object") return false;
    const count = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;
    return typeof item.date === "string" && (item.date === "" || /^\d{4}-\d{2}-\d{2}$/.test(item.date)) &&
      count(item.start) && item.start < 1440 && count(item.end) && item.end > item.start && item.end <= 2880 &&
      count(item.rn) && count(item.pn) && count(item.leaders) && (item.skills == null || (typeof item.skills === "object" && !Array.isArray(item.skills) && Object.values(item.skills).every(count)));
  });
}

export function PolicyPanel({ roster, token, onSaved, onBackToGrid }: PolicyPanelProps) {
  const [section, setSection] = useState("staffing");
  const currentPolicy = roster.policy || {};
  const policyAny = currentPolicy as unknown as { targets?: Target[]; staffing?: Staffing[] };

  // 1. Hard Constraints
  const [minRestHours, setMinRestHours] = useState(currentPolicy.minRestHours ?? 8);
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState(currentPolicy.maxConsecutiveDays ?? 6);
  const [maxConsecutiveNights, setMaxConsecutiveNights] = useState(currentPolicy.maxConsecutiveNights ?? 3);
  const [maxConsecutiveOffDays, setMaxConsecutiveOffDays] = useState(currentPolicy.maxConsecutiveOffDays ?? 2);
  const [compressOffOnShortage, setCompressOffOnShortage] = useState(currentPolicy.compressOffOnShortage ?? true);
  const [allowOTOnShortage] = useState(currentPolicy.allowOTOnShortage ?? true);
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

  const formSignature = JSON.stringify({ minRestHours, maxConsecutiveDays, maxConsecutiveNights,
    maxConsecutiveOffDays, compressOffOnShortage, allowOTOnShortage, maxMonthlyHours,
    maxContinuousHours, maxDoubleShifts, fairnessHours, wCoverage, wFairness, wPreference,
    wStability, targets, staffing: staffingMode === "json" ? staffingJson : JSON.stringify(staffingList, null, 2) });
  const [savedSignature, setSavedSignature] = useState(formSignature);
  const hasChanges = savedSignature !== formSignature;

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
    if (mode === staffingMode) return;
    if (mode === "visual") {
      try {
        const parsed = JSON.parse(staffingJson);
        if (!isStaffingList(parsed)) throw new Error();
        setStaffingList(parsed);
      } catch {
        setError("รูปแบบ JSON ไม่ถูกต้อง กรุณาแก้ไขก่อนกลับไปโหมดตาราง ข้อมูลที่พิมพ์ยังอยู่ครบ");
        return;
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
          if (!isStaffingList(parsedStaffing)) {
            throw new Error();
          }
        } catch {
          setError("ข้อมูลอัตรากำลังไม่ถูกต้อง: ต้องมีเวลาเริ่ม–สิ้นสุดที่เรียงถูกต้อง และจำนวน RN / PN / หัวหน้า / ทักษะเป็นจำนวนเต็มตั้งแต่ 0");
          return;
        }
      } else {
        parsedStaffing = staffingList;
      }

      if (!isStaffingList(parsedStaffing)) {
        setError("ตรวจช่วงเวลาและจำนวนคน: เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม และจำนวนคนต้องเป็นจำนวนเต็มตั้งแต่ 0");
        return;
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
      setSavedSignature(formSignature);
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
    <fieldset disabled={busy} className="policy-workspace min-w-0 space-y-4" onChangeCapture={() => setSuccessMsg("")}>
      {/* 1. Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Cog6ToothIcon className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">นโยบายและเงื่อนไขการจัดเวร</h2>
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

          </div>
        </div>

        <p role="status" className={"text-sm font-semibold " + (hasChanges ? "text-amber-800" : "text-slate-600")}>
          {hasChanges ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "ยังไม่มีการแก้ไขที่รอบันทึก"}
        </p>
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

      </div>

      <div className="policy-layout">
        <nav aria-label="หมวดการตั้งค่านโยบาย" className="policy-nav">
          <p className="font-semibold text-slate-900">ตั้งค่าการจัดเวร</p>
          <p className="text-xs text-slate-500">เริ่มที่จำนวนคน แล้วตรวจทานก่อนบันทึก</p>
          {[["staffing", "1. จำนวนคนต่อเวร", `${staffingList.length} ช่วงเวลา`], ["limits", "2. เวลาทำงานและการพัก", `พักอย่างน้อย ${minRestHours} ชม.`], ["targets", "3. เป้าหมายบุคลากร", `${targets.length} คน · แยก RN / PN`], ["weights", "4. ตั้งค่าขั้นสูง", "น้ำหนักและค่าตั้งต้น"], ["review", "5. ตรวจทานก่อนบันทึก", hasChanges ? "มีค่าที่รอบันทึก" : "ยังไม่มีการแก้ไข"]].map(([id, label, summary]) => (
            <button key={id} type="button" aria-current={section === id ? "step" : undefined} aria-controls={"policy-" + id} onClick={() => setSection(id)} className={section === id ? "is-active" : ""}>
              <span>{label}</span><small>{summary}</small>
            </button>
          ))}
        </nav>
        <div className="policy-content">
      {/* 2. Staffing Requirements (Section 1) */}
      <div id="policy-staffing" hidden={section !== "staffing"} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-800">1. แต่ละผลัดต้องใช้กี่คน</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-xl p-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => handleApplyPresets("3shifts")}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 rounded-lg transition hover:bg-white cursor-pointer"
              >
                ตัวอย่าง 3 ผลัด (ช/บ/ด)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPresets("12h")}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 rounded-lg transition hover:bg-white cursor-pointer"
              >
                ผลัด 12 ชม.
              </button>
            </div>
            <details className="policy-technical"><summary>กฎเฉพาะวันที่ / ทักษะ (ขั้นสูง)</summary><div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSwitchMode("visual")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${staffingMode === "visual" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600"}`}
              >
                ตาราง
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode("json")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${staffingMode === "json" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600"}`}
              >
                <CodeBracketIcon className="w-3.5 h-3.5 inline mr-1" />
                ขั้นสูง: JSON
              </button>
            </div></details>
          </div>
        </div>

        <div id="policy-staffing-help" className="policy-help"><p>จำนวนขั้นต่ำต่อช่วงเวลา • RN ปฏิบัติงานไม่รวมหัวหน้าเวร • รวมคน = RN + หัวหน้าเวร + PN</p><details><summary>วิธีนับคนและเลือกเวลาข้ามวัน</summary>          <p><strong>ข้อบังคับ • จำนวนขั้นต่ำตลอดช่วงเวลา</strong> เลือกช่วงที่ต้องมีคนปฏิบัติงานจริง การเพิ่มจำนวนทำให้ต้องใช้บุคลากรมากขึ้น และอาจเหลือเวรที่จัดไม่ได้</p>
          <p><strong>RN ไม่นับรวมหัวหน้าในช่องนี้:</strong> RN 2 + หัวหน้า 1 = ต้องมี RN รวม 3 คน และมีผู้เป็นหัวหน้าอย่างน้อย 1 คน หากเพิ่ม PN 1 จะต้องใช้รวม 4 คน</p>
          <p><strong>เวลาเริ่ม / สิ้นสุด:</strong> เช่น 20.00–08.00 ให้เลือก 08.00 วันถัดไป ส่วน 16.00–เที่ยงคืนให้เลือก 24.00 ปุ่มตัวอย่างผลัดจะแทนรายการทั้งหมดด้านล่าง</p>
          <p>RN = พยาบาลวิชาชีพ • PN = ผู้ช่วยพยาบาล • หัวหน้า = ผู้มีคุณสมบัติหัวหน้าเวร • ใส่ 0 หากไม่ต้องการตำแหน่งนั้น</p>
</details></div>
        {staffingMode === "visual" ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="policy-staffing-table">
                <caption className="sr-only">จำนวนบุคลากรขั้นต่ำต่อเวร</caption>
                <thead><tr><th>ช่วงเวลา</th><th>เริ่ม</th><th>สิ้นสุด</th><th>RN ปฏิบัติงาน</th><th>หัวหน้าเวร (RN)</th><th>PN</th><th>รวมคน</th><th><span className="sr-only">ลบ</span></th></tr></thead>
                <tbody>{staffingList.map((item, index) => (
                  <tr key={index}>
                    <td><strong>ผลัดที่ {index + 1}</strong><small>{(item.end - item.start) / 60} ชม. · {item.date || "ทุกวัน"}</small>
                      {Object.keys(item.skills ?? {}).length > 0 && <small>ทักษะ: {Object.entries(item.skills ?? {}).map(([skill, count]) => skill + " " + count + " คน").join(" • ")}</small>}
                    </td>
                    {(["start", "end"] as const).map(key => <td key={key}>
                      <select aria-label={(key === "start" ? "เวลาเริ่ม" : "เวลาสิ้นสุด") + " ผลัดที่ " + (index + 1)} aria-describedby="policy-staffing-help" value={item[key]} onChange={e => handleUpdateStaffingRow(index, { [key]: Number(e.target.value) })}>
                        {COMMON_TIME_OPTIONS.filter(opt => key === "end" || opt.mins < 1440).map(opt => <option key={opt.mins} value={opt.mins}>{minsToTimeString(opt.mins)}{opt.mins >= 1440 ? " วันถัดไป" : ""}</option>)}
                        {!COMMON_TIME_OPTIONS.some(opt => opt.mins === item[key]) && <option value={item[key]}>{formatThaiTimeLabel(item[key])}</option>}
                      </select>
                      {key === "end" && item.end <= item.start && <small role="alert" className="text-rose-700">สิ้นสุดต้องอยู่หลังเวลาเริ่ม</small>}
                    </td>)}
                    {(["rn", "leaders", "pn"] as const).map(key => <td key={key}><input type="number" min="0" max={key === "leaders" ? 10 : 20} aria-label={({ rn: "RN ไม่รวมหัวหน้า", leaders: "หัวหน้าเวร", pn: "PN" }[key]) + " ผลัดที่ " + (index + 1)} aria-describedby="policy-staffing-help" value={item[key]} onChange={e => handleUpdateStaffingRow(index, { [key]: Math.max(0, Number(e.target.value)) })} /></td>)}
                    <td><strong className="text-blue-800">{item.rn + item.leaders + item.pn} คน</strong><small>RN {item.rn + item.leaders} + PN {item.pn}</small><span className="sr-only">ต้องมี RN รวม {item.rn + item.leaders} คน + PN {item.pn} คน = {item.rn + item.leaders + item.pn} คน</span></td>
                    <td><button type="button" aria-label={"ลบผลัดที่ " + (index + 1)} onClick={() => handleRemoveStaffingRow(index)} className="p-2 text-slate-500 hover:text-rose-600"><TrashIcon className="h-4 w-4" /></button></td>
                  </tr>
                ))}</tbody>
              </table>
              {staffingList.length === 0 && <p className="p-4 text-sm text-slate-500">ยังไม่มีช่วงเวลาเวร กดเพิ่มช่วงเวลาเวรด้านล่าง</p>}
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
          <div className="mt-2 space-y-2">
            <p className="text-sm text-slate-600">สำหรับผู้ดูแลที่ต้องตั้งกฎเฉพาะวันที่หรือทักษะ: date ว่างใช้ทุกวัน เวลา start / end เป็นนาทีจากเที่ยงคืน และ skills ระบุจำนวนคนขั้นต่ำต่อทักษะ หากแก้ไขผิดรูปแบบ ระบบจะเก็บข้อความไว้ให้แก้ก่อนสลับกลับตาราง</p>
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
      <div hidden={section !== "limits"} className="space-y-6">
        {/* Hard Constraints */}
        <div id="policy-limits" hidden={section !== "limits"} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <ShieldCheckIcon className="w-5 h-5 text-rose-600" />
            <h3 className="text-base font-bold text-slate-800">2. ขอบเขตเวลาทำงานและการพัก</h3>
          </div>
          <p className="text-sm text-slate-600">ข้อบังคับที่ตารางต้องผ่านทุกข้อ • เลือกตามนโยบายที่หน่วยงานอนุมัติ</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-minRestHours" className="block text-sm font-bold text-slate-700 mb-2">พักขั้นต่ำระหว่างเวร (ชม.):</label>
              <input
                type="number"
                min="0"
                max="48"
                step="0.5"
                id="policy-minRestHours"
                aria-describedby="policy-minRestHours-help"
                value={minRestHours}
                onChange={(e) => setMinRestHours(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="minRestHours" value={minRestHours} />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-maxConsecutiveDays" className="block text-sm font-bold text-slate-700 mb-2">วันทำงานติดต่อกันสูงสุด (วัน):</label>
              <input
                type="number"
                min="1"
                max="31"
                id="policy-maxConsecutiveDays"
                aria-describedby="policy-maxConsecutiveDays-help"
                value={maxConsecutiveDays}
                onChange={(e) => setMaxConsecutiveDays(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="maxConsecutiveDays" value={maxConsecutiveDays} />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-maxConsecutiveNights" className="block text-sm font-bold text-slate-700 mb-2">เวรดึกติดต่อกันสูงสุด (คืน):</label>
              <input
                type="number"
                min="1"
                max="14"
                id="policy-maxConsecutiveNights"
                aria-describedby="policy-maxConsecutiveNights-help"
                value={maxConsecutiveNights}
                onChange={(e) => setMaxConsecutiveNights(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="maxConsecutiveNights" value={maxConsecutiveNights} />
            </div>



            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-maxMonthlyHours" className="block text-sm font-bold text-slate-700 mb-2">ชั่วโมงรวมสูงสุด/เดือน (ชม.):</label>
              <input
                type="number"
                min="40"
                max="744"
                id="policy-maxMonthlyHours"
                aria-describedby="policy-maxMonthlyHours-help"
                value={maxMonthlyHours}
                onChange={(e) => setMaxMonthlyHours(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="maxMonthlyHours" value={maxMonthlyHours} />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-maxContinuousHours" className="block text-sm font-bold text-slate-700 mb-2">ชั่วโมงต่อเนื่องสูงสุด (ชม.):</label>
              <input
                type="number"
                min="8"
                max="48"
                id="policy-maxContinuousHours"
                aria-describedby="policy-maxContinuousHours-help"
                value={maxContinuousHours}
                onChange={(e) => setMaxContinuousHours(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="maxContinuousHours" value={maxContinuousHours} />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-maxDoubleShifts" className="block text-sm font-bold text-slate-700 mb-2">เวรควบสูงสุด/เดือน (ครั้ง):</label>
              <input
                type="number"
                min="0"
                max="31"
                id="policy-maxDoubleShifts"
                aria-describedby="policy-maxDoubleShifts-help"
                value={maxDoubleShifts}
                onChange={(e) => setMaxDoubleShifts(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="maxDoubleShifts" value={maxDoubleShifts} />
            </div>
          </div>

          <h4 className="text-sm font-bold text-slate-800">แนวทางและข้อเตือน — ไม่ใช่ข้อบังคับ</h4>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-maxConsecutiveOffDays" className="block text-sm font-bold text-slate-700 mb-2">วันหยุดประจำ (OFF) ต่อเนื่องสูงสุด (วัน):</label>
              <input
                type="number"
                min="1"
                max="14"
                id="policy-maxConsecutiveOffDays"
                aria-describedby="policy-maxConsecutiveOffDays-help"
                value={maxConsecutiveOffDays}
                onChange={(e) => setMaxConsecutiveOffDays(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="maxConsecutiveOffDays" value={maxConsecutiveOffDays} />
            </div>
          <h4 className="text-sm font-bold text-slate-800">ตัวเลือกเมื่อคนไม่พอ</h4>
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
                  ให้ความสำคัญกับคนที่พักแล้วเมื่อเติมเวร
                </span>
                <span className="block text-[11px] text-blue-700 leading-relaxed">
                  เปิด: เพิ่มโอกาสเลือกคนที่ OFF มาแล้วอย่างน้อย 1 วันมาลงเวร จึงอาจได้หยุดติดกันน้อยลง ไม่ได้รับประกันว่าจะเรียกกลับทันที ปิด: ลดแรงจูงใจนี้ แต่โหมดสมดุลและเน้นกำลังคนยังใช้แนวทางนี้อยู่
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 bg-indigo-50/60 hover:bg-indigo-50 border border-indigo-200 rounded-2xl cursor-pointer transition">
              <input
                type="checkbox"
                checked={allowOTOnShortage}
                readOnly
                disabled
                className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="block text-xs font-bold text-indigo-950">
                  OT เมื่อคนไม่พอ — ยังไม่พร้อมใช้งาน
                </span>
                <span className="block text-[11px] text-indigo-700 leading-relaxed">
                  ค่าที่เก็บไว้ยังไม่มีผลควบคุมการจัดเวร การเปิดหรือปิดจึงยังใช้อนุญาตหรือห้าม OT ไม่ได้ ให้ตรวจเพดานชั่วโมงและผลจัดเวรจริง
                </span>
              </div>
            </label>
          </div>
        </div>

      </div>

      {/* Individual targets */}
      <div id="policy-targets" hidden={section !== "targets"} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black">
              🎯
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">3. เป้าหมายชั่วโมง วันหยุด และจำนวนเวรรายคน</h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  ทั้งหมด {activeStaff.length} คน
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                แยกตั้งค่าชั่วโมงเป้าหมายและวัน OFF เป้าหมาย ระหว่างพยาบาลวิชาชีพ (RN) และผู้ช่วยพยาบาล (PN) อย่างอิสระ
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

        <div id="policy-target-help" className="policy-help"><p>ตั้งค่าทั้งกลุ่มก่อน แล้วปรับเฉพาะรายคน • เป้าหมายใช้เป็นแนวทาง ไม่ใช่เพดานห้ามเกิน</p><details><summary>ความหมายของเป้าหมายและโควตาเวร</summary>          <p><strong>ชั่วโมงเป้าหมาย:</strong> จำนวนชั่วโมงที่อยากให้แต่ละคนทำในเดือน เช่น 160 ชม. เทียบได้กับ 20 เวรที่ยาว 8 ชม. หากไม่ตรงจะเป็นข้อเตือน ไม่ใช่เพดานห้ามเกิน</p>
          <p><strong>วัน OFF เป้าหมาย:</strong> จำนวนวันหยุดที่ต้องการ ระบบเตือนทั้งเมื่อมากกว่าหรือน้อยกว่าเป้าหมาย ส่วนวัน OFF ขั้นต่ำสำหรับบุคลากรประจำที่บังคับใช้ขณะนี้คือ {currentPolicy.minOff ?? 0} วัน</p>
          <p><strong>โควตาเวร:</strong> จำนวนครั้งที่ต้องการของเวรแต่ละรหัส เช่น ดึก 4 ครั้ง หากได้ 3 หรือ 5 ครั้งจะมีข้อเตือน ช่องว่างหมายถึงไม่ตั้งเป้าหมาย ส่วน 0 หมายถึงเป้าหมาย 0 ครั้ง ไม่ใช่คำสั่งห้ามเวร</p>
          <p><strong>ตั้งค่าด่วน RN / PN:</strong> ใส่ชั่วโมงและ OFF แล้วกดกำหนดให้ทั้งกลุ่ม จากนั้นปรับรายคนที่มีเงื่อนไขต่างกัน ปุ่มนี้มีผลต่อทุกคนในกลุ่ม แม้กำลังค้นหารายชื่ออยู่ และยังต้องกดบันทึกนโยบาย</p>
</details></div>
        <p className="text-sm text-slate-700">เพดานทำงานรายคน <strong>{maxMonthlyHours} ชม./เดือน</strong> · วัน OFF ขั้นต่ำ {currentPolicy.minOff ?? 0} วัน</p>
        {targets.some(t => t.hours > maxMonthlyHours) && <p role="alert" className="text-sm text-amber-800">มีชั่วโมงเป้าหมายสูงกว่าเพดานรายเดือน กรุณาทบทวนรายคน</p>}
        {displayedStaff.length === 0 && <p className="p-4 text-slate-500">ไม่พบรายชื่อที่ตรงกับการค้นหา</p>}
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
              <div className="policy-bulk flex items-center gap-3 flex-wrap text-sm">
                <span className="text-[11px] font-bold text-blue-900">⚡ ตั้งค่าด่วนเฉพาะ RN:</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-600">ชั่วโมงเป้าหมาย:</span>
                  <input
                    type="number"
                    aria-label="ชั่วโมงเป้าหมาย ทั้งกลุ่ม RN"
                    aria-describedby="policy-target-help"
                    value={bulkHoursRN}
                    onChange={(e) => setBulkHoursRN(Number(e.target.value))}
                    className="w-16 bg-white border border-blue-300 rounded-lg px-2 py-0.5 text-xs text-center font-bold text-blue-950"
                  />
                  <span className="text-sm text-slate-600">วันหยุด:</span>
                  <input
                    type="number"
                    aria-label="วัน OFF เป้าหมาย ทั้งกลุ่ม RN"
                    aria-describedby="policy-target-help"
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
                    <th className="p-3 font-bold w-36 text-center">วัน OFF เป้าหมาย (วัน)</th>
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
                              aria-label={"ชั่วโมงเป้าหมาย " + nurse.name}
                              aria-describedby="policy-target-help"
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
                              aria-label={"วัน OFF เป้าหมาย " + nurse.name}
                              aria-describedby="policy-target-help"
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
              <div className="policy-bulk flex items-center gap-3 flex-wrap text-sm">
                <span className="text-[11px] font-bold text-emerald-900">⚡ ตั้งค่าด่วนเฉพาะ PN:</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-600">ชั่วโมงเป้าหมาย:</span>
                  <input
                    type="number"
                    aria-label="ชั่วโมงเป้าหมาย ทั้งกลุ่ม PN"
                    aria-describedby="policy-target-help"
                    value={bulkHoursPN}
                    onChange={(e) => setBulkHoursPN(Number(e.target.value))}
                    className="w-16 bg-white border border-emerald-300 rounded-lg px-2 py-0.5 text-xs text-center font-bold text-emerald-950"
                  />
                  <span className="text-sm text-slate-600">วันหยุด:</span>
                  <input
                    type="number"
                    aria-label="วัน OFF เป้าหมาย ทั้งกลุ่ม PN"
                    aria-describedby="policy-target-help"
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
                    <th className="p-3 font-bold w-36 text-center">วัน OFF เป้าหมาย (วัน)</th>
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
                              aria-label={"ชั่วโมงเป้าหมาย " + nurse.name}
                              aria-describedby="policy-target-help"
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
                              aria-label={"วัน OFF เป้าหมาย " + nurse.name}
                              aria-describedby="policy-target-help"
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

        {/* Soft Weights */}
        <div id="policy-weights" hidden={section !== "weights"} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <p className="text-sm text-slate-600">ใช้ค่าเดิมได้ หากหน่วยงานยังไม่มีข้อกำหนดให้ปรับน้ำหนัก</p>
          <details className="policy-help"><summary>เริ่มใหม่ด้วยค่าตั้งต้นจากทีม</summary>        <p className="text-sm text-amber-900 bg-amber-50 rounded-xl p-3">ปุ่มค่าตั้งต้นด้านล่างจะแทนอัตรากำลัง เป้าหมายรายคน โควตา เวลาพัก เพดานชั่วโมง และน้ำหนักหลายค่าในหน้านี้ ต้องตรวจทานและบันทึกอีกครั้ง ไม่ใช่การคำนวณจากภาระงานผู้ป่วย</p>
        {/* Quick Auto-Set Defaults Banner */}
        <div className="p-4 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-purple-50/80 border border-blue-200 rounded-2xl flex items-center justify-between flex-wrap gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-blue-950">ช่วยตั้งค่าตั้งต้นจากจำนวนบุคลากร</div>
              <div className="text-[11px] text-blue-700 mt-0.5">
                มีบุคลากรใช้งาน {activeStaff.length} คน (RN: {rnStaff.length} คน, PN: {pnStaff.length} คน, หัวหน้าเวร: {activeStaff.filter(n => n.leader).length} คน)
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { if (window.confirm("แทนค่าในแบบฟอร์มด้วยค่าตั้งต้นจากทีม?\nจะเปลี่ยนอัตรากำลัง เป้าหมายทุกคนเป็น 160 ชม. / OFF 8 วัน ล้างโควตา และคืนค่าเวลาพัก เพดานชั่วโมงกับน้ำหนัก\nยังไม่บันทึกจนกดยืนยันนโยบาย")) handleSetDefaultsFromStaff(); }}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>ใช้ค่าตั้งต้นจากทีม</span>
          </button>
        </div>
</details>
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <ScaleIcon className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-800">4. ตั้งค่าขั้นสูง</h3>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">น้ำหนัก 0–1000 เป็นสัดส่วนความสำคัญในการประเมินตาราง ไม่ใช่เปอร์เซ็นต์และไม่ต้องรวมได้ 100 หากยังไม่แน่ใจให้คงค่าเดิม การเพิ่มน้ำหนักไม่ทำให้ระบบข้ามข้อบังคับ และไม่ได้รับประกันว่าจะได้ตรงทุกเป้าหมาย หากตั้งทุกน้ำหนักเป็น 0 คะแนนรวมจะเฉลี่ยทั้ง 4 ด้านเท่ากัน</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-wCoverage" className="block text-sm font-bold text-slate-700 mb-2">ความครบถ้วนอัตรากำลัง (Coverage):</label>
              <input
                type="number"
                min="0"
                max="1000"
                id="policy-wCoverage"
                aria-describedby="policy-wCoverage-help"
                value={wCoverage}
                onChange={(e) => setWCoverage(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="wCoverage" />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-wFairness" className="block text-sm font-bold text-slate-700 mb-2">ความเท่าเทียมชั่วโมงเวร (Fairness):</label>
              <input
                type="number"
                min="0"
                max="1000"
                id="policy-wFairness"
                aria-describedby="policy-wFairness-help"
                value={wFairness}
                onChange={(e) => setWFairness(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="wFairness" />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-wPreference" className="block text-sm font-bold text-slate-700 mb-2">ความพึงพอใจการขอเวร (Preference):</label>
              <input
                type="number"
                min="0"
                max="1000"
                id="policy-wPreference"
                aria-describedby="policy-wPreference-help"
                value={wPreference}
                onChange={(e) => setWPreference(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="wPreference" />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label htmlFor="policy-wStability" className="block text-sm font-bold text-slate-700 mb-2">ความคงที่ของตาราง (Stability):</label>
              <input
                type="number"
                min="0"
                max="1000"
                id="policy-wStability"
                aria-describedby="policy-wStability-help"
                value={wStability}
                onChange={(e) => setWStability(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="wStability" />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 sm:col-span-2">
              <label htmlFor="policy-fairnessHours" className="block text-sm font-bold text-slate-700 mb-2">เกณฑ์แจ้งเตือนส่วนต่างชั่วโมง (ชม.):</label>
              <input
                type="number"
                min="0"
                max="168"
                id="policy-fairnessHours"
                aria-describedby="policy-fairnessHours-help"
                value={fairnessHours}
                onChange={(e) => setFairnessHours(Number(e.target.value))}
                disabled={busy}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PolicyFieldHelp field="fairnessHours" value={fairnessHours} />
            </div>
          </div>
        </div>

      <section id="policy-review" hidden={section !== "review"} className="rounded-3xl border border-blue-200 bg-blue-50 p-5 space-y-3 text-sm text-blue-950">
        <h3 className="font-bold">5. ตรวจทานก่อนบันทึก</h3>
        {staffingMode === "json" ? <p className="text-amber-900">กำลังใช้ข้อมูล JSON กรุณาตรวจอัตรากำลังในหมวดจำนวนคนก่อนบันทึก</p> : <div className="rounded-xl bg-white p-4 space-y-2"><h4 className="font-semibold">จำนวนคนขั้นต่ำต่อเวร</h4>{staffingList.map((item, i) => <p key={i}>{minsToTimeString(item.start)}–{minsToTimeString(item.end)}{item.end >= 1440 ? " วันถัดไป" : ""} · {item.date || "ทุกวัน"} · RN {item.rn} + หัวหน้า {item.leaders} + PN {item.pn} = <strong>{item.rn + item.leaders + item.pn} คน</strong></p>)}</div>}
        <p>พักอย่างน้อย <strong>{minRestHours} ชม.</strong> • ทำงานติดกันไม่เกิน <strong>{maxConsecutiveDays} วัน</strong> • ดึกติดกันไม่เกิน <strong>{maxConsecutiveNights} คืน</strong></p>
        <p>เพดานรายคน <strong>{maxMonthlyHours} ชม./เดือน</strong> • ทำงานต่อเนื่องไม่เกิน <strong>{maxContinuousHours} ชม.</strong> • เวรควบไม่เกิน <strong>{maxDoubleShifts} ครั้ง/เดือน</strong></p>
        <p>เป้าหมายรายคน {targets.length} คน • น้ำหนัก: กำลังคน {wCoverage} / ความสมดุล {wFairness} / คำขอเวร {wPreference} / คงตารางเดิม {wStability}</p>
        {targets.some(t => t.hours > maxMonthlyHours) && <p role="alert" className="font-semibold text-amber-900">มีเป้าหมายชั่วโมงรายคนสูงกว่าเพดานรายเดือน ควรทบทวนเป้าหมายให้สอดคล้องกัน</p>}
        <p>การบันทึกจะยืนยันนโยบายของแผนก {roster.wardId} สำหรับใช้ตรวจตารางและจัดเวรครั้งถัดไป ไม่ได้สร้างหรือเปลี่ยนเวรที่ลงไว้ให้อัตโนมัติ</p>
      </section>
        </div>
      </div>
      {/* 5. Sticky Bottom Action Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-lg flex items-center justify-between flex-wrap gap-3 sticky bottom-4">
        <div className="text-xs text-slate-500 font-medium">
          {hasChanges ? "มีค่าที่ยังไม่บันทึก — ตรวจทานแล้วกดบันทึกและยืนยันนโยบาย" : "ตรวจทานทุกหมวดก่อนยืนยันนโยบายของหน่วยงาน"}
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
            aria-label={section === "review" ? "บันทึกและยืนยันนโยบาย" : "ตรวจทานก่อนบันทึก"}
            onClick={() => section === "review" ? handleSave() : setSection("review")}
            disabled={busy}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <span>💾</span>}
            <span>{section === "review" ? "บันทึกและยืนยันนโยบาย" : "ตรวจทานก่อนบันทึก"}</span>
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
                กำหนดจำนวนเวรเป้าหมายต่อเดือน เช่น 4 ครั้ง: ได้ 3 หรือ 5 ครั้งจะมีข้อเตือน ไม่ใช่เพดานห้ามเกิน เว้นว่าง = ไม่ตั้งเป้าหมาย; 0 = เป้าหมาย 0 ครั้ง โดยไม่ได้ห้ามจัดเวรนั้น
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
                          placeholder="ไม่ตั้งเป้า"
                          aria-label={"จำนวนเวรเป้าหมาย " + (sh.name || sh.code)}
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
                ใช้ค่าในหน้านี้ (ยังไม่บันทึก)
              </button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
