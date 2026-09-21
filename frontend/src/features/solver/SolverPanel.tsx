"use client";
import { useEffect, useState } from "react";
import { request, ApiError } from "@/lib/api";
import { ShiftBadge } from "@/components/schedule/ShiftBadge";
import {
  SparklesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  PlayIcon,
  XMarkIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import type { Cell, Nurse, Roster, RosterResponse, Violation } from "@/types/schedule";

type Score = { coverage: number; fairness: number; preference: number; stability: number; total: number };
type Readiness = {
  ready: boolean;
  revision: string;
  policyVersion: string;
  excludedShifts: string[];
  issues: { code: string; field: string; date: string; nurseId: string; message: string; fixPath: string }[];
};
type ShortageDetail = {
  date: string;
  shiftCode: string;
  position: string;
  required: number;
  assigned: number;
  missing: number;
  missingSkills?: Record<string, number>;
  blockingRules?: string[];
  suggestions?: string[];
};

// Sprint 5: ข้อกำหนดเวรสำหรับ Part-time (ส่งเฉพาะเมื่อ minimum_shortage_proven)
type PTRequirement = {
  date: string;
  shiftCode: string;
  position: string;
  missing: number;
  missingLeader?: boolean;
  missingSkills?: Record<string, number>;
  constraintEvidence: string[];
};

type Diagnostics = {
  // ฟิลด์เดิม
  nodes: number;
  exhausted: boolean;
  reason: string;
  attempts: number;
  repairs: number;
  strategies: string[];
  blockingRules: Record<string, number>;
  shortages?: ShortageDetail[];
  feasibility?: string;
  partTimeShifts?: number;
  partTimeNurses?: number;
  // Sprint 5: ฟิลด์ใหม่
  regularSearchStatus?: "complete" | "search_incomplete" | "minimum_shortage_proven" | "invalid_fixed_data";
  remainingShortages?: ShortageDetail[];
  partTimeRequirements?: PTRequirement[];
  canContinue?: boolean;
};


type PlanMetrics = {
  fairnessScore: number;
  preferenceRate: number;
  consecutiveOffs: number;
  twelveHourShifts: number;
  doubleShifts: number;
  hoursStdDev: number;
  maxHours: number;
  minHours: number;
};

type MultiPlanOption = {
  profile: string;
  title: string;
  description: string;
  jobId: string;
  result: {
    status: string;
    assignments: Cell[];
    violations: Violation[];
    diagnostics?: Diagnostics;
    score: Score;
    profile?: string;
    metrics?: PlanMetrics;
  };
  metrics: PlanMetrics;
};

type MultiPlanResponse = {
  plans: MultiPlanOption[];
};

type Job = {
  id: string;
  status: string;
  simulation: boolean;
  stale: boolean;
  applied: boolean;
  progress: number;
  error: string;
  before: Score;
  result: null | {
    status: string;
    assignments: Cell[];
    violations: Violation[];
    diagnostics?: Diagnostics;
    score: Score;
    profile?: string;
    metrics?: PlanMetrics;
  };
};

interface SolverPanelProps {
  roster: Roster;
  token: string;
  onApplied: (data: RosterResponse) => void;
  onRosterUpdated?: (data: RosterResponse) => void;
  onFixIssue?: (path: string) => void;
  onBackToGrid?: () => void;
}

const ALL_SHIFTS = ["ช", "บ", "ด", "ชบ", "บด", "D", "N", "x", "L"];

export function SolverPanel({ roster, token, onApplied, onRosterUpdated, onFixIssue }: SolverPanelProps) {
  const [ready, setReady] = useState<Readiness | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [multiPlans, setMultiPlans] = useState<MultiPlanOption[] | null>(null);
  const [selectedPlanProfile, setSelectedPlanProfile] = useState<string>("balanced");
  const [simulation, setSimulation] = useState(false);
  const [allowPartTime, setAllowPartTime] = useState(true);
  const [maxPartTimeRN, setMaxPartTimeRN] = useState(2);
  const [maxPartTimePN, setMaxPartTimePN] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [nurseIds, setNurseIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");
  const [showAutoReadyModal, setShowAutoReadyModal] = useState(false);
  const [autoReadyPlan, setAutoReadyPlan] = useState<{
    actions: string[];
    guarantees: string[];
    payload: any;
  } | null>(null);

  const active = job?.status === "pending" || job?.status === "running";

  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (e instanceof ApiError && e.details && typeof e.details === "object" && "violations" in e.details) {
        const rep = e.details as { violations?: Array<{ severity: string; message: string; ruleCode: string; date?: string; subjectId?: string }> };
        const errors = (rep.violations || []).filter((v) => v.severity === "error");
        if (errors.length > 0) {
          const detailMsgs = errors.slice(0, 3).map((v) => `${v.message}${v.date ? ` (วันที่ ${v.date})` : ""}`).join(", ");
          setError(`ไม่สามารถนำตารางไปใช้ได้เนื่องจากติดกฎ: ${detailMsgs}`);
          return;
        }
      }
      setError(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // Poll job status
  useEffect(() => {
    if (!job?.id || job.applied || job.stale || ["cancelled", "failed", "completed"].includes(job.status)) return;
    const controller = new AbortController();
    const poll = () => {
      void request<Job>("/jobs/" + job.id, token, "GET", undefined, controller.signal)
        .then(setJob)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "อ่านสถานะไม่สำเร็จ");
        });
    };
    const timer = setInterval(poll, 1000);
    const initial = setTimeout(poll, 300);
    return () => {
      clearInterval(timer);
      clearTimeout(initial);
      controller.abort();
    };
  }, [job?.id, job?.status, job?.stale, job?.applied, token]);

  // Initial readiness check
  useEffect(() => {
    void (async () => {
      try {
        const report = await request<Readiness>(`/schedules/${roster.id}/readiness-check`, token, "POST", { simulation });
        setReady(report);
      } catch {
        // ignore initial error
      }
    })();
  }, [roster.id, token, simulation]);

  async function check() {
    const report = await request<Readiness>(`/schedules/${roster.id}/readiness-check`, token, "POST", { simulation });
    setReady(report);
    return report;
  }

  // Safe Auto Ready Advisor: Proposes non-destructive fixes without mutating staff permissions, staffing demands, or boundary
  function prepareAutoReady() {
    setError("");
    setSuccessNotice("");
    const activeStaff = roster.staff.filter((n) => n.active);
    const totalN = activeStaff.length;

    if (totalN === 0) {
      setError("ไม่พบบุคลากรที่มีสถานะใช้งานในวอร์ดนี้ กรุณาเพิ่มพยาบาลก่อน");
      return;
    }

    const daysInMonth = new Date(Date.UTC(roster.year, roster.month, 0)).getUTCDate();
    const minOff = roster.policy?.minOff ?? 8;
    const actions: string[] = [];
    const currentPolicy = roster.policy || {};
    let needsPolicyUpdate = false;
    const policyPayload = { ...currentPolicy };

    // 1. Confirm policy if draft
    if (currentPolicy.status !== "confirmed") {
      actions.push("ยืนยันชุดตั้งค่านโยบาย (Policy Status: confirmed) เพื่ออนุญาตให้ระบบเริ่มจัดเวร");
      policyPayload.status = "confirmed";
      needsPolicyUpdate = true;
    }

    // 2. Add default targets if missing
    const existingTargetMap = new Map((currentPolicy.targets || []).map((t: any) => [t.nurseId, t]));
    const missingTargets = activeStaff.filter((n) => !existingTargetMap.has(n.id));
    if (missingTargets.length > 0) {
      actions.push(`กำหนดเป้าหมายชั่วโมงและวันหยุดมาตรฐานให้บุคลากรที่ยังไม่มี (${missingTargets.length} คน: ${minOff} วัน OFF, ${(daysInMonth - minOff) * 8} ชม.)`);
      const fullTargets = activeStaff.map((n) => {
        const existing: any = existingTargetMap.get(n.id);
        if (existing) return existing;
        return {
          nurseId: n.id,
          hours: (daysInMonth - minOff) * 8,
          off: minOff,
          quotas: {},
        };
      });
      policyPayload.targets = fullTargets;
      needsPolicyUpdate = true;
    }

    // 3. Expand date gap if any
    const firstDay = `${roster.year}-${String(roster.month).padStart(2, "0")}-01`;
    const lastDay = `${roster.year}-${String(roster.month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    if (!policyPayload.effectiveFrom || policyPayload.effectiveFrom > firstDay) {
      actions.push(`ปรับวันเริ่มต้นของนโยบายเป็น ${firstDay} ให้ครอบคลุมทั้งเดือน`);
      policyPayload.effectiveFrom = firstDay;
      needsPolicyUpdate = true;
    }
    if (!policyPayload.effectiveTo || policyPayload.effectiveTo < lastDay) {
      actions.push(`ปรับวันสิ้นสุดของนโยบายให้ครอบคลุมถึง ${lastDay}`);
      policyPayload.effectiveTo = "2099-12-31";
      needsPolicyUpdate = true;
    }

    const guarantees = [
      "🛡️ รักษายอดอัตรากำลังที่ต้องการ (Staffing Requirements) ตามที่หน่วยงานกำหนด 100% ไม่ปรับลด",
      "🛡️ รักษาสิทธิ์ขึ้นเวร สิทธิ์เวรควบ และทักษะเฉพาะของบุคลากรตามจริง ไม่บังคับเปิดสิทธิ์",
      "🛡️ ไม่แต่งประวัติเวรย้อนหลัง (Boundary) เองโดยพลการ",
    ];

    setAutoReadyPlan({
      actions: actions.length > 0 ? actions : ["ชุดข้อมูลพร้อมใช้งาน ไม่จำเป็นต้องปรับโครงสร้างนโยบาย"],
      guarantees,
      payload: needsPolicyUpdate ? policyPayload : null,
    });
    setShowAutoReadyModal(true);
  }

  async function applyAutoReady() {
    if (!autoReadyPlan) return;
    setFixing(true);
    setError("");
    setSuccessNotice("");

    try {
      if (autoReadyPlan.payload) {
        await request(`/wards/${encodeURIComponent(roster.wardId)}/roster-policy`, token, "PUT", autoReadyPlan.payload);
        const fresh = await request<RosterResponse>(`/schedules/${roster.id}`, token);
        if (onRosterUpdated) {
          onRosterUpdated(fresh);
        }
      }

      setShowAutoReadyModal(false);
      const rep = await request<Readiness>(`/schedules/${roster.id}/readiness-check`, token, "POST", { simulation });
      setReady(rep);

      if (rep.ready) {
        setSuccessNotice("🎉 ปรับปรุงความพร้อมเรียบร้อย! ข้อมูลพร้อมสำหรับจัดเวร 100% โดยคงข้อกำหนดจริงของหน่วยงานไว้ทั้งหมด");
      } else {
        setSuccessNotice("ปรับปรุงนโยบายเรียบร้อยแล้ว แต่ยังมีข้อผิดพลาด/ข้อมูลที่ต้องบันทึกจริงตามรายการด้านล่าง");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Readiness & 1-Click Fix Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-6 w-6 text-blue-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                1. ตรวจสอบความพร้อมก่อนเริ่มจัดเวร (Readiness Checklist)
              </h4>
              <p className="text-xs text-slate-500">
                ระบบตรวจสอบข้อมูลกฎเวร, เวรย้อนหลัง, เป้าหมายรายบุคคล และสิทธิ์การขึ้นเวร
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void action(async () => { await check(); })}
            disabled={busy || fixing}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            <span>ตรวจความพร้อมอีกครั้ง</span>
          </button>
        </div>

        {/* Pre-Solve Staffing Feasibility & Capacity Balance Analysis */}
        {(() => {
          const daysInMonth = new Date(Date.UTC(roster.year, roster.month, 0)).getUTCDate();
          const activeRN = roster.staff.filter((n) => n.active && n.position === "RN").length;
          const activePN = roster.staff.filter((n) => n.active && n.position === "PN").length;
          const minOff = roster.policy?.minOff || 8;
          const maxCapRN = activeRN * (daysInMonth - minOff);
          const maxCapPN = activePN * (daysInMonth - minOff);

          const defaultStaffing = roster.policy?.staffing?.filter((s) => !s.date) || [];
          const dailyReqRN = defaultStaffing.reduce((acc, s) => acc + (s.rn || 0) + (s.leaders || 0), 0);
          const dailyReqPN = defaultStaffing.reduce((acc, s) => acc + (s.pn || 0), 0);
          const monthlyReqRN = dailyReqRN * daysInMonth;
          const monthlyReqPN = dailyReqPN * daysInMonth;

          const rnDeficit = monthlyReqRN - maxCapRN;
          const pnDeficit = monthlyReqPN - maxCapPN;
          const hasDeficit = (dailyReqRN > 0 && rnDeficit > 0) || (dailyReqPN > 0 && pnDeficit > 0);

          const rnUtilization = activeRN > 0 ? (dailyReqRN / activeRN) : 0;
          const isRNTightRotation = dailyReqRN > 0 && rnDeficit <= 0 && rnUtilization >= 0.65;

          return (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs shadow-2xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📊 วิเคราะห์ความสมดุลกำลังคนประจำเดือน ({daysInMonth} วัน)</span>
                </span>
                {onFixIssue && (
                  <button
                    type="button"
                    onClick={() => onFixIssue("/settings/roster-policy")}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>⚙️ ปรับนโยบายอัตรากำลัง</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* RN Card */}
                <div className={`p-2.5 rounded-lg border ${
                  dailyReqRN > 0 && rnDeficit > 0
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : isRNTightRotation
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}>
                  <div className="flex items-center justify-between font-bold text-[11px]">
                    <span>พยาบาลวิชาชีพ (RN {activeRN} คน)</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                      dailyReqRN > 0 && rnDeficit > 0
                        ? "bg-rose-200 text-rose-900"
                        : isRNTightRotation
                        ? "bg-amber-200 text-amber-950"
                        : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {dailyReqRN > 0 && rnDeficit > 0
                        ? `❌ ขาด ${rnDeficit} เวร`
                        : isRNTightRotation
                        ? `⚠️ ตึงตัววิกฤต (${Math.round(rnUtilization * 100)}%)`
                        : `✅ เพียงพอ (+${maxCapRN - monthlyReqRN} เวร)`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    ต้องการวันละ {dailyReqRN} คน ({monthlyReqRN} เวร/เดือน) | ศักยภาพ {maxCapRN} เวร
                  </div>
                </div>

                {/* PN Card */}
                <div className={`p-2.5 rounded-lg border ${dailyReqPN > 0 && pnDeficit > 0 ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-slate-50 border-slate-200 text-slate-800"}`}>
                  <div className="flex items-center justify-between font-bold text-[11px]">
                    <span>ผู้ช่วยพยาบาล (PN {activePN} คน)</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${dailyReqPN > 0 && pnDeficit > 0 ? "bg-rose-200 text-rose-900" : "bg-emerald-100 text-emerald-800"}`}>
                      {dailyReqPN > 0 && pnDeficit > 0 ? `❌ ขาด ${pnDeficit} เวร` : `✅ เพียงพอ (+${maxCapPN - monthlyReqPN} เวร)`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    ต้องการวันละ {dailyReqPN} คน ({monthlyReqPN} เวร/เดือน) | ศักยภาพ {maxCapPN} เวร
                  </div>
                </div>
              </div>

              {isRNTightRotation && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                  <span className="shrink-0 text-sm">⚠️</span>
                  <div>
                    <span className="font-bold">ข้อสังเกตความตึงตัว: </span>
                    สัดส่วนขึ้นเวรต่อวันสูงถึง {Math.round(rnUtilization * 100)}% (ต้องการ {dailyReqRN} จาก {activeRN} คน) การหมุนเวร 3 ผลัดที่มีเวรดึกต้องใช้คนอย่างน้อย {Math.ceil(dailyReqRN * 1.45)} คน จึงจะหมุนเวรได้โดยไม่ติดกฎเวลาพัก ระบบจะใช้เวรควบ (ชบ 16 ชม.) ที่ได้รับอนุญาตช่วยในการจัดเวร
                  </div>
                </div>
              )}

              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] text-indigo-900 flex items-start gap-2">
                <span className="shrink-0 text-sm">💡</span>
                <div>
                  <span className="font-bold">หลักการประเมินและจัดตารางเวร: </span>
                  ระบบประเมินกำลังคนจากวันลาจริง สิทธิ์ขึ้นเวร ทักษะเฉพาะ และวันหยุด โดยตัวค้นหาจะลองสลับเวร ย้ายวัน OFF ที่ไม่ล็อก และเปิดใช้เวรควบที่ได้รับอนุญาต เพื่อเติมเต็มอัตรากำลังของวอร์ดให้ครบถ้วนโดยไม่ละเมิดกฎความปลอดภัย
                </div>
              </div>
            </div>
          );
        })()}

        {/* Readiness Status Card */}
        {ready && (
          <div className="space-y-3">
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between flex-wrap gap-2 ${
                ready.ready
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              <div className="flex items-center gap-2">
                {ready.ready ? (
                  <CheckCircleIcon className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <ExclamationTriangleIcon className="h-5 w-5 text-rose-600 shrink-0" />
                )}
                <span className="text-xs font-bold">
                  {ready.ready ? "ข้อมูลพร้อมจัดเวร 100% (ผ่านเกณฑ์ทั้งหมด)" : "ยังไม่พร้อมจัดเวร — มีข้อมูลที่ต้องแก้ไขหรือเติมให้ครบ"}
                </span>
              </div>

              {!ready.ready && (
                <button
                  type="button"
                  onClick={() => prepareAutoReady()}
                  disabled={fixing || busy}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <WrenchScrewdriverIcon className={`h-4 w-4 ${fixing ? "animate-spin" : ""}`} />
                  <span>⚡ Auto Ready Advisor (ตรวจสอบและเตรียมความพร้อม)</span>
                </button>
              )}
            </div>

            {/* Auto Ready Advisor Confirmation Modal */}
            {showAutoReadyModal && autoReadyPlan && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        ⚡
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">ข้อเสนอปรับปรุงความพร้อม (Auto Ready Proposal)</h3>
                        <p className="text-[11px] text-slate-500">ตรวจสอบรายการและผลกระทบก่อนยืนยันดำเนินการ</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAutoReadyModal(false)}
                      className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                        <span>📝 รายการที่จะดำเนินการปรับปรุง:</span>
                      </div>
                      <ul className="space-y-1 bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-slate-700">
                        {autoReadyPlan.actions.map((act, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-blue-600 font-bold">•</span>
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-bold text-emerald-800 mb-1.5 flex items-center gap-1.5">
                        <span>🛡️ สิ่งที่ระบบคงไว้ตามเดิม 100% (ไม่แก้ไขข้อมูลต้นทาง):</span>
                      </div>
                      <ul className="space-y-1 bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-emerald-900">
                        {autoReadyPlan.guarantees.map((g, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-600 font-bold">✓</span>
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAutoReadyModal(false)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyAutoReady()}
                      disabled={fixing}
                      className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                    >
                      {fixing ? "กำลังปรับปรุง..." : "ยืนยันและดำเนินการ"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* List of issues */}
            {!ready.ready && ready.issues.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-600">
                  รายการข้อผิดพลาดที่พบ ({ready.issues.length} รายการ):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ready.issues.map((i, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-rose-200 rounded-xl text-xs shadow-2xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-rose-700 text-[11px] bg-rose-100 px-1.5 py-0.5 rounded">
                          {i.code}
                        </span>
                        {onFixIssue && (
                          <button
                            type="button"
                            onClick={() => onFixIssue(i.fixPath)}
                            className="text-[11px] text-blue-600 hover:text-blue-800 underline font-semibold"
                          >
                            เปิดหน้าแก้ไข
                          </button>
                        )}
                      </div>
                      <div className="text-slate-800 font-medium text-xs">{i.message}</div>
                      <div className="text-[10px] text-slate-400">
                        {i.date ? `วันที่: ${i.date} ` : ""}
                        {i.nurseId ? `บุคลากร: ${i.nurseId}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {successNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center justify-between gap-2 shadow-2xs animate-fade-in">
            <span>{successNotice}</span>
            <button
              type="button"
              onClick={() => setSuccessNotice("")}
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
      </div>

      {/* 2. Scope & Settings Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-6 w-6 text-indigo-600 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-slate-800">
              2. กำหนดขอบเขตและรูปแบบการจัดเวร
            </h4>
            <p className="text-xs text-slate-500">
              เลือกว่าต้องการจัดทั้งเดือนหรือจัดเฉพาะช่วงวัน และเลือกโหมดจัดจริงหรือจำลอง
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
              <input
                type="checkbox"
                checked={simulation}
                onChange={(e) => {
                  setSimulation(e.target.checked);
                  setReady(null);
                }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">🧪 โหมดจำลองผลลัพธ์ (Simulation Mode)</span>
                <p className="text-[11px] text-slate-500">
                  ทดลองจัดเวรโดยยอมรับชุดตั้งค่าแบบร่าง เพื่อดูคะแนนและแนวโน้มตารางเวร
                </p>
              </div>
            </label>

            <div className="flex flex-col gap-2 p-3 bg-purple-50/70 border border-purple-200 rounded-xl transition">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-purple-950">📋 สรุปเวรที่ต้องการ Part-time (Sprint 5)</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-200 text-purple-900 font-black">ใหม่</span>
                </div>
                <p className="text-[11px] text-purple-800/80 mt-1">
                  ระบบจัดคนประจำให้ครบทั้งเดือนก่อน — หากพิสูจน์ได้ว่าคนประจำไม่พอจริง จะแสดงรายการเวรที่ต้องการ Part-time พร้อมหลักฐานข้อจำกัดจริง ไม่สร้างบุคลากรสมมติ
                </p>
              </div>
            </div>

          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              วันที่เริ่ม (เว้นว่าง = ต้นเดือน):
            </label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={busy || active}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              วันที่สิ้นสุด (เว้นว่าง = สิ้นเดือน):
            </label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={busy || active}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              บุคลากร ({nurseIds.length === 0 ? "ทุกคนในวอร์ด" : `${nurseIds.length} คน`}):
            </label>
            <select
              multiple
              value={nurseIds}
              onChange={(e) => setNurseIds(Array.from(e.target.selectedOptions, (x) => x.value))}
              disabled={busy || active}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium h-[38px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {roster.staff
                .filter((n) => n.active)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.position})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Start Buttons */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] text-slate-500">
            🔒 ช่องที่ล็อกเวรไว้ (Locked) และช่องที่อยู่นอกขอบเขตจะคงเดิม ไม่ถูกแก้ไข
          </span>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Single Solve Button */}
            <button
              type="button"
              disabled={busy || active || (ready !== null && !ready.ready)}
              onClick={() =>
                void action(async () => {
                  const report = await check();
                  if (!report.ready) return;
                  setMultiPlans(null);
                  setJob(
                    await request<Job>(`/schedules/${roster.id}/${simulation ? "simulate" : "generate"}`, token, "POST", {
                      wardId: roster.wardId,
                      month: roster.month,
                      year: roster.year,
                      revision: report.revision,
                      policyVersion: report.policyVersion,
                      scope: { start, end, nurseIds },
                      seed: 1,
                      allowPartTime,
                      maxPartTimeRN,
                      maxPartTimePN,
                    })
                  );
                })
              }
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition border flex items-center gap-2 ${
                ready?.ready
                  ? "bg-white hover:bg-slate-50 text-slate-700 border-slate-300 active:scale-95 cursor-pointer shadow-xs"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <PlayIcon className="h-4 w-4" />
              <span>{simulation ? "จำลองเดี่ยว" : "จัดเวรเดี่ยว (Single)"}</span>
            </button>

            {/* Multi-Plan Generation Button */}
            <button
              type="button"
              disabled={busy || active || (ready !== null && !ready.ready)}
              onClick={() =>
                void action(async () => {
                  const report = await check();
                  if (!report.ready) return;
                  const res = await request<MultiPlanResponse>(`/schedules/${roster.id}/generate-multi`, token, "POST", {
                    wardId: roster.wardId,
                    month: roster.month,
                    year: roster.year,
                    revision: report.revision,
                    policyVersion: report.policyVersion,
                    scope: { start, end, nurseIds },
                    seed: Date.now(),
                    allowPartTime,
                    maxPartTimeRN,
                    maxPartTimePN,
                  });
                  setMultiPlans(res.plans);
                  if (res.plans && res.plans.length > 0) {
                    const first = res.plans[0];
                    setSelectedPlanProfile(first.profile);
                    setJob({
                      id: first.jobId,
                      status: "completed",
                      simulation: false,
                      stale: false,
                      applied: false,
                      progress: 100,
                      error: "",
                      before: { coverage: 0, fairness: 0, preference: 0, stability: 0, total: 0 },
                      result: first.result,
                    });
                  }
                })
              }
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-md flex items-center gap-2 ${
                ready?.ready
                  ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 text-white shadow-purple-500/25 active:scale-95 cursor-pointer"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
              }`}
            >
              <SparklesIcon className="h-4 w-4" />
              <span>✨ จัดเวรเปรียบเทียบ 3 รูปแบบ (Generate 3 Plans)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Plan Comparison Section */}
      {multiPlans && multiPlans.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-white border-2 border-indigo-200 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-indigo-600/20">
                ⚖️
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-indigo-950 flex items-center gap-2">
                  <span>เปรียบเทียบตารางเวร 3 รูปแบบ (Alternative Schedule Plans)</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                    เลือกแผนที่ต้องการแล้วกดนำไปใช้ได้ทันที
                  </span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  ระบบคำนวณ 3 แนวทางที่มีจุดเด่นแตกต่างกัน เพื่อให้หัวหน้าตึกตัดสินใจเลือกแผนที่เหมาะสมที่สุดกับวอร์ด
                </p>
              </div>
            </div>
          </div>

          {/* 3 Alternative Plan Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {multiPlans.map((p) => {
              const isSelected = selectedPlanProfile === p.profile;
              const isApplied = job?.id === p.jobId && job?.applied;
              const theme =
                p.profile === "balanced"
                  ? {
                      border: isSelected ? "border-blue-500 ring-2 ring-blue-400/40" : "border-slate-200 hover:border-blue-300",
                      badge: "bg-blue-100 text-blue-800",
                      headerBg: "bg-blue-50/80",
                      accentText: "text-blue-700",
                      btnBg: "bg-blue-600 hover:bg-blue-700",
                      icon: "⚖️",
                    }
                  : p.profile === "rest_focused"
                  ? {
                      border: isSelected ? "border-emerald-500 ring-2 ring-emerald-400/40" : "border-slate-200 hover:border-emerald-300",
                      badge: "bg-emerald-100 text-emerald-800",
                      headerBg: "bg-emerald-50/80",
                      accentText: "text-emerald-700",
                      btnBg: "bg-emerald-600 hover:bg-emerald-700",
                      icon: "🏖️",
                    }
                  : {
                      border: isSelected ? "border-purple-500 ring-2 ring-purple-400/40" : "border-slate-200 hover:border-purple-300",
                      badge: "bg-purple-100 text-purple-800",
                      headerBg: "bg-purple-50/80",
                      accentText: "text-purple-700",
                      btnBg: "bg-purple-600 hover:bg-purple-700",
                      icon: "💖",
                    };

              return (
                <div
                  key={p.profile}
                  onClick={() => {
                    setSelectedPlanProfile(p.profile);
                    setJob({
                      id: p.jobId,
                      status: "completed",
                      simulation: false,
                      stale: false,
                      applied: isApplied,
                      progress: 100,
                      error: "",
                      before: { coverage: 0, fairness: 0, preference: 0, stability: 0, total: 0 },
                      result: p.result,
                    });
                  }}
                  className={`bg-white rounded-2xl border transition-all p-4 flex flex-col justify-between cursor-pointer shadow-xs hover:shadow-md ${theme.border}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{theme.icon}</span>
                        <div>
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${theme.badge}`}>
                            {p.profile}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900 mt-1">{p.title}</h4>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="text-xs bg-emerald-500 text-white font-bold p-1 rounded-full shadow-xs">
                          ✓
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 leading-relaxed min-h-[32px]">{p.description}</p>

                    {/* Metrics Highlights Table */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">คะแนนความเท่าเทียม (Fairness):</span>
                        <span className="font-extrabold text-slate-800">
                          {p.metrics.fairnessScore.toFixed(1)} / 100
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">ตอบสนองความต้องการ:</span>
                        <span className={`font-extrabold ${p.metrics.preferenceRate >= 90 ? "text-emerald-600" : "text-slate-800"}`}>
                          {p.metrics.preferenceRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">วันหยุดติดกัน 2+ วัน:</span>
                        <span className="font-extrabold text-indigo-700">
                          {p.metrics.consecutiveOffs} บล็อก
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">เวร 12 ชม. / ควบเวร:</span>
                        <span className="font-bold text-slate-700">
                          {p.metrics.twelveHourShifts} / {p.metrics.doubleShifts} ครั้ง
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">ส่วนเบี่ยงเบน ชม. (StdDev):</span>
                        <span className="font-bold text-slate-700">
                          ±{p.metrics.hoursStdDev.toFixed(1)} ชม.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions inside card */}
                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlanProfile(p.profile);
                        setJob({
                          id: p.jobId,
                          status: "completed",
                          simulation: false,
                          stale: false,
                          applied: isApplied,
                          progress: 100,
                          error: "",
                          before: { coverage: 0, fairness: 0, preference: 0, stability: 0, total: 0 },
                          result: p.result,
                        });
                      }}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition ${
                        isSelected
                          ? "bg-slate-800 text-white border-slate-800 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {isSelected ? "👁️ กำลังดูผังเวรนี้" : "👁️ ดูตัวอย่างผังเวร"}
                    </button>

                    <button
                      type="button"
                      disabled={busy || isApplied}
                      onClick={(e) => {
                        e.stopPropagation();
                        void action(async () => {
                          const result = await request<RosterResponse>(`/jobs/${p.jobId}/apply`, token, "POST", {});
                          setJob({
                            id: p.jobId,
                            status: "completed",
                            simulation: false,
                            stale: false,
                            applied: true,
                            progress: 100,
                            error: "",
                            before: { coverage: 0, fairness: 0, preference: 0, stability: 0, total: 0 },
                            result: p.result,
                          });
                          onApplied(result);
                        });
                      }}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-lg text-white transition shadow-xs flex items-center gap-1 ${
                        isApplied
                          ? "bg-slate-300 text-slate-500 cursor-default"
                          : `${theme.btnBg} active:scale-95 cursor-pointer`
                      }`}
                    >
                      <span>{isApplied ? "✓ นำไปใช้แล้ว" : "✨ เลือกใช้แผนนี้"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Running Job Progress & Status */}
      {job && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">⚙️</span>
              <span className="text-sm font-bold text-slate-800">
                สถานะงานจัดเวร: <span className="text-blue-600 font-extrabold capitalize">{job.status}</span>
              </span>
            </div>
            {active && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    setJob(await request<Job>("/jobs/" + job.id, token, "DELETE"));
                  })
                }
                className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition"
              >
                ยกเลิกงาน
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                job.status === "failed" || job.status === "cancelled"
                  ? "bg-rose-500"
                  : job.status === "completed"
                  ? "bg-emerald-500"
                  : "bg-blue-600 animate-pulse"
              }`}
              style={{ width: `${job.progress || 10}%` }}
            />
          </div>

          {job.error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
              เกิดข้อผิดพลาด: {job.error}
            </div>
          )}

          {job.stale && !job.applied && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
              ⚠️ ผลการจัดเวรนี้ล้าสมัย เนื่องจากข้อมูลหรือกฎถูกเปลี่ยนแปลงระหว่างรัน กรุณากดจัดใหม่อีกครั้ง
            </div>
          )}

          {/* 4. Results & Score Board */}
          {job.result && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span>ผลลัพธ์การประมวลผล:</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                        job.result.status === "complete"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {job.result.status === "complete" ? "สมบูรณ์ (Complete)" : "ไม่ครบถ้วน (Partial)"}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {job.result.status === "complete"
                      ? "ตารางเวรผ่านข้อบังคับความปลอดภัยทั้งหมด พร้อมนำไปใช้งาน"
                      : "ยังมีบางผลัดขาดอัตรากำลังหรือติดข้อบังคับ ไม่สามารถกดใช้ผลได้"}
                  </p>
                </div>
              </div>

              {/* Score Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { key: "total", label: "คะแนนรวม (Total)", color: "from-blue-600 to-indigo-600" },
                  { key: "coverage", label: "ความครบถ้วน (Coverage)", color: "from-teal-600 to-emerald-600" },
                  { key: "fairness", label: "ความเป็นธรรม (Fairness)", color: "from-indigo-600 to-purple-600" },
                  { key: "preference", label: "ความพึงพอใจ (Preference)", color: "from-amber-600 to-orange-600" },
                  { key: "stability", label: "ความนิ่งตาราง (Stability)", color: "from-slate-600 to-slate-800" },
                ].map(({ key, label }) => {
                  const beforeVal = job.before?.[key as keyof Score] ?? 0;
                  const afterVal = job.result?.score?.[key as keyof Score] ?? 0;
                  const diff = afterVal - beforeVal;

                  return (
                    <div
                      key={key}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col justify-between"
                    >
                      <div className="text-[11px] font-bold text-slate-600 truncate">{label}</div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-base font-extrabold text-slate-900">{afterVal.toFixed(1)}</span>
                        {diff !== 0 && (
                          <span
                            className={`text-[11px] font-bold ${
                              diff > 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">เดิม: {beforeVal.toFixed(1)}</div>
                    </div>
                  );
                })}
              </div>

              {/* Proposed Assignments Table (Collapsible) */}
              <details className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                <summary className="font-bold text-slate-800 cursor-pointer select-none">
                  🔍 ดูตารางข้อเสนอที่จัดได้ ({job.result.assignments.length} ช่องเวร)
                </summary>
                <div className="mt-3 max-h-60 overflow-y-auto pr-1">
                  <div className="grid grid-cols-[100px_1fr_60px] gap-2 font-bold text-slate-500 pb-1 border-b text-[11px]">
                    <span>วันที่</span>
                    <span>บุคลากร</span>
                    <span>เวร</span>
                  </div>
                  <div className="divide-y divide-slate-200/60">
                    {job.result.assignments.map((c) => {
                      const staffMember = roster.staff.find((n) => n.id === c.nurseId);
                      return (
                        <div
                          key={c.date + c.nurseId}
                          className="grid grid-cols-[100px_1fr_60px] gap-2 items-center py-1.5 text-[11px]"
                        >
                          <span className="text-slate-600">{c.date}</span>
                          <span className="font-medium text-slate-800 truncate">
                            {staffMember?.name ?? c.nurseId}
                          </span>
                          <div>
                            <ShiftBadge shiftCode={c.shiftCode} locked={c.locked} size="sm" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>

              {/* Sprint 5: 3-Group Result Panel ตาม regularSearchStatus */}
              {job.result.diagnostics?.regularSearchStatus && (() => {
                const rss = job.result.diagnostics.regularSearchStatus;
                const ptReqs = job.result.diagnostics.partTimeRequirements ?? [];
                const canContinue = job.result.diagnostics.canContinue ?? false;
                return (
                  <div className="space-y-3">
                    {/* กลุ่ม 1: จัดครบ */}
                    {rss === "complete" && (
                      <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-2xl flex items-center gap-3">
                        <span className="text-2xl">✅</span>
                        <div>
                          <div className="font-bold text-emerald-800 text-xs">จัดคนประจำครบทั้งเดือน</div>
                          <div className="text-[11px] text-emerald-700 mt-0.5">ระบบจัดเวรครบทุกผลัดโดยใช้บุคลากรประจำเท่านั้น ไม่ต้องการ Part-time</div>
                        </div>
                      </div>
                    )}

                    {/* กลุ่ม 2: ยังค้นหาไม่จบ */}
                    {rss === "search_incomplete" && (
                      <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">⏳</span>
                            <div>
                              <div className="font-bold text-amber-800 text-xs">ยังค้นหาไม่จบภายในเวลาที่กำหนด</div>
                              <div className="text-[11px] text-amber-700 mt-0.5">
                                แสดงตารางที่ดีที่สุดที่พบ — ยังไม่สามารถยืนยันว่าคนประจำไม่พอจริง สามารถค้นหาต่อได้
                              </div>
                            </div>
                          </div>
                          {canContinue && (
                            <button
                              type="button"
                              disabled={busy || active}
                              onClick={() => void action(async () => {
                                const report = await check();
                                if (!report.ready) return;
                                setJob(
                                  await request<Job>(`/schedules/${roster.id}/${simulation ? "simulate" : "generate"}`, token, "POST", {
                                    wardId: roster.wardId,
                                    month: roster.month,
                                    year: roster.year,
                                    revision: report.revision,
                                    policyVersion: report.policyVersion,
                                    scope: { start, end, nurseIds },
                                    seed: Math.floor(Math.random() * 10000),
                                    allowPartTime: false,
                                    maxPartTimeRN: 0,
                                    maxPartTimePN: 0,
                                    previousJobId: job.id,
                                  })
                                );
                              })}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                              <ArrowPathIcon className="h-3.5 w-3.5" />
                              <span>🔍 ค้นหาต่อ (Continue Search)</span>
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                          ⚠️ ขอบเขตการค้นหาครอบคลุมเฉพาะรอบนี้ — การหมดเวลาไม่ใช่หลักฐานว่าจัดไม่ได้
                        </div>
                      </div>
                    )}

                    {/* กลุ่ม 3: ยืนยันเวรเหลือสำหรับ Part-time */}
                    {rss === "minimum_shortage_proven" && ptReqs.length > 0 && (
                      <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">🩺</span>
                          <div>
                            <div className="font-bold text-rose-800 text-xs flex items-center gap-2">
                              <span>ยืนยันเวรที่ต้องการ Part-time ({ptReqs.length} รายการ)</span>
                              <span className="text-[10px] bg-rose-200 text-rose-900 font-extrabold px-2 py-0.5 rounded-full">🚫 พิสูจน์แล้วว่าจัดไม่ครบด้วยคนประจำ</span>
                            </div>
                            <div className="text-[11px] text-rose-700 mt-0.5">
                              ระบบพิสูจน์แล้วว่าคนประจำไม่เพียงพอสำหรับเวรต่อไปนี้ — กรุณาติดต่อจัดหาบุคลากร Part-time จริง
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {ptReqs.map((req, idx) => (
                            <div key={idx} className="p-3 bg-white border border-rose-200 rounded-xl space-y-2">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[11px]">วันที่ {req.date}</span>
                                  <span className="font-bold text-slate-800 text-[11px]">
                                    ผลัด {req.shiftCode || "ไม่ระบุ"} | ต้องการ {req.position} {req.missing} คน
                                    {req.missingLeader && <span className="ml-1 text-[10px] bg-purple-100 text-purple-800 px-1.5 rounded-full font-bold">รวมหัวหน้าเวร</span>}
                                  </span>
                                </div>
                                {req.missingSkills && Object.keys(req.missingSkills).length > 0 && (
                                  <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                                    ขาดทักษะ: {Object.entries(req.missingSkills).map(([k, v]) => `${k} (${v})`).join(", ")}
                                  </span>
                                )}
                              </div>
                              {req.constraintEvidence && req.constraintEvidence.length > 0 && (
                                <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg space-y-1">
                                  <div className="font-bold text-slate-700">หลักฐานข้อจำกัดจริง (ทำไมคนประจำจัดลงไม่ได้):</div>
                                  <ul className="list-disc list-inside space-y-0.5 text-[10.5px]">
                                    {req.constraintEvidence.map((ev, eIdx) => (
                                      <li key={eIdx}>{ev}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="text-[10px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
                          📋 รายการนี้ถือเป็น "เวรว่าง" ยังไม่นับเป็นตารางสมบูรณ์ — ห้ามบันทึกเป็นตารางใช้งานจนกว่าจะได้บุคลากร Part-time จริงมาเติม
                        </div>
                      </div>
                    )}

                    {/* กลุ่มพิเศษ: ข้อมูลล็อกขัดกฎ */}
                    {rss === "invalid_fixed_data" && (
                      <div className="p-3.5 bg-red-50 border border-red-300 rounded-2xl flex items-start gap-3">
                        <span className="text-2xl shrink-0">⛔</span>
                        <div>
                          <div className="font-bold text-red-800 text-xs">พบข้อมูลล็อกที่ขัดกฎข้อบังคับ</div>
                          <div className="text-[11px] text-red-700 mt-0.5">
                            มีเวรที่ล็อกไว้ขัดกฎความปลอดภัย — กรุณาตรวจสอบและแก้ไขข้อมูลล็อกก่อน ระบบไม่สามารถสรุปเป็นความต้องการ Part-time ได้ในสถานะนี้
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Legacy Part-time Relief Banner (backward compat สำหรับผลงานเก่า) */}
              {!job.result.diagnostics?.regularSearchStatus && job.result.diagnostics?.partTimeShifts !== undefined && job.result.diagnostics.partTimeShifts > 0 && (
                <div className="p-3.5 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-2xl text-xs text-purple-950 shadow-2xs flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🕒</span>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        <span>
                          จัดเวรเสริมอัตโนมัติ (Part-time Relief): {job.result.diagnostics.partTimeNurses ?? 1} คน (รวม {job.result.diagnostics.partTimeShifts} เวร)
                        </span>
                      </div>
                      <div className="text-[11px] text-purple-700 mt-0.5">ผลจากงานเก่า (pre-Sprint 5)</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shortage Diagnostics (legacy / remaining shortages) */}
              {(job.result.diagnostics?.remainingShortages ?? job.result.diagnostics?.shortages ?? []).length > 0 && (
                <div className="space-y-3 p-4 bg-rose-50/80 border border-rose-200 rounded-2xl text-xs text-slate-800 shadow-2xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 text-base bg-rose-100 text-rose-700 border border-rose-300">
                        🩺
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <span>รายงานวิเคราะห์ช่องขาดและทางเลือกสำหรับหัวหน้าวอร์ด</span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                                ? "bg-rose-200 text-rose-900"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                              ? "🚫 พิสูจน์แล้วว่าจัดไม่ครบตามเงื่อนไขจริง"
                              : "⏳ ยังค้นหาไม่พบภายในเวลางบประมาณ (แสดงผลลัพธ์ที่ดีที่สุด)"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          ระบบได้ทดลองสลับเวร ย้ายวัน OFF และใช้เวรควบตามสิทธิ์แล้ว แต่ยังติดข้อบังคับในบางจุด ดังนี้:
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    {(job.result.diagnostics?.remainingShortages ?? job.result.diagnostics?.shortages ?? []).map((sh, idx) => (
                      <div key={idx} className="p-3 bg-white border border-rose-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                              วันที่ {sh.date}
                            </span>
                            <span className="font-bold text-slate-800">
                              ผลัด {sh.shiftCode || "ไม่ระบุ"} | ขาด {sh.position} {sh.missing} คน (ต้องการ {sh.required}, จัดได้ {sh.assigned})
                            </span>
                          </div>
                          {sh.missingSkills && Object.keys(sh.missingSkills).length > 0 && (
                            <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                              ขาดทักษะ: {Object.entries(sh.missingSkills).map(([k, v]) => `${k} (${v})`).join(", ")}
                            </span>
                          )}
                        </div>

                        {sh.blockingRules && sh.blockingRules.length > 0 && (
                          <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg space-y-1">
                            <div className="font-bold text-slate-700">สาเหตุที่พยาบาลท่านอื่นจัดลงไม่ได้ (ติดกฎข้อบังคับ):</div>
                            <ul className="list-disc list-inside space-y-0.5 text-[10.5px]">
                              {sh.blockingRules.map((b, bIdx) => (
                                <li key={bIdx}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {sh.suggestions && sh.suggestions.length > 0 && (
                          <div className="text-[11px] text-emerald-800 bg-emerald-50/70 p-2 rounded-lg space-y-1 border border-emerald-200">
                            <div className="font-bold flex items-center gap-1 text-emerald-900">
                              <span>💡 ทางเลือกสำหรับหัวหน้าวอร์ด:</span>
                            </div>
                            <ul className="list-disc list-inside space-y-0.5 text-[10.5px]">
                              {sh.suggestions.map((s, sIdx) => (
                                <li key={sIdx}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Violations / Quality Summary in Proposed Roster */}
              {job.result.violations.length > 0 && (() => {
                const criticalList = job.result.violations.filter((v) => v.severity === "error");
                const overstaffList = job.result.violations.filter((v) => v.ruleCode === "OVER_STAFFING");
                const targetList = job.result.violations.filter((v) => ["TARGET_HOURS", "TARGET_OFF", "SHIFT_QUOTA"].includes(v.ruleCode));
                const prefList = job.result.violations.filter((v) => v.ruleCode === "PREFERENCE");
                const fairnessList = job.result.violations.filter((v) => v.ruleCode === "FAIRNESS");

                return (
                  <div className="space-y-3 p-4 bg-gradient-to-br from-amber-50/80 via-slate-50 to-orange-50/60 border border-amber-200 rounded-2xl text-xs text-slate-800 shadow-2xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 text-base ${
                          criticalList.length > 0 ? "bg-rose-100 text-rose-700 border border-rose-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        }`}>
                          {criticalList.length > 0 ? "⚠️" : "💡"}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>สรุปผลการตรวจตารางเวร ({job.result.violations.length} ข้อสังเกต)</span>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              criticalList.length > 0
                                ? "bg-rose-100 text-rose-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}>
                              {criticalList.length > 0 ? `พบข้อผิดพลาด ${criticalList.length} ข้อ` : "✅ ผ่านเกณฑ์ความปลอดภัย 100%"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {criticalList.length === 0
                              ? "รายการทั้งหมดด้านล่างเป็น 'ข้อสังเกตและคำแนะนำเชิงคุณภาพ' (ไม่ใช่ข้อผิดพลาด สามารถนำตารางไปใช้งานได้ทันที)"
                              : "มีข้อผิดพลาดร้ายแรงที่ต้องแก้ไขก่อนนำไปประกาศใช้งาน"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Categorized Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {/* 1. Critical Errors */}
                      <div className={`p-2.5 rounded-xl border ${criticalList.length > 0 ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-white border-slate-200 text-slate-700"}`}>
                        <div className="flex items-center justify-between font-bold text-[11px]">
                          <span>🚫 ข้อผิดพลาดร้ายแรง (Critical)</span>
                          <span className={`px-1.5 py-0.2 rounded font-extrabold ${criticalList.length > 0 ? "bg-rose-200 text-rose-900" : "text-emerald-700"}`}>
                            {criticalList.length > 0 ? `${criticalList.length} รายการ` : "0 (ไม่มี)"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {criticalList.length > 0 ? "ต้องแก้ไขข้อผิดพลาดก่อนบันทึกใช้งาน" : "ผ่านเกณฑ์เวลาพัก, ไม่ต่อดึกเช้า, ไม่ทับวันลา"}
                        </p>
                      </div>

                      {/* 2. Overstaffing */}
                      {overstaffList.length > 0 && (
                        <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-700">
                          <div className="flex items-center justify-between font-bold text-[11px]">
                            <span>👥 อัตรากำลังเสริมในบางผลัด</span>
                            <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded font-bold">
                              {overstaffList.length} วัน
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            มีพยาบาลเข้าเวรเสริมมากกว่าเป้าขั้นต่ำเพื่อเกลี่ยชั่วโมงทำงานให้ครบ (ปกติ ไม่ต้องแก้)
                          </p>
                        </div>
                      )}

                      {/* 3. Targets */}
                      {targetList.length > 0 && (
                        <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-700">
                          <div className="flex items-center justify-between font-bold text-[11px]">
                            <span>⏱️ การเกลี่ยชั่วโมงและวันหยุด</span>
                            <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-bold">
                              {targetList.length} รายการ
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            ชั่วโมงทำงานของแต่ละท่านกระจายใกล้เคียงเป้าหมายมาตรฐาน (~160-184 ชม.)
                          </p>
                        </div>
                      )}

                      {/* 4. Preferences & Fairness */}
                      {(prefList.length > 0 || fairnessList.length > 0) && (
                        <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-700">
                          <div className="flex items-center justify-between font-bold text-[11px]">
                            <span>⭐ ความพึงพอใจรายบุคคล</span>
                            <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">
                              {prefList.length + fairnessList.length} รายการ
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            จัดคนให้ครบทุกผลัดหลัก อาจมีบางเวรที่ยังไม่ตรงกับความชอบส่วนบุคคล
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Expandable Detail List */}
                    <details className="pt-1 text-[11px]">
                      <summary className="font-bold text-slate-700 cursor-pointer select-none hover:text-slate-900 flex items-center gap-1">
                        <span>🔍 ดูรายละเอียดข้อสังเกตรายวันทั้งหมด ({job.result.violations.length} รายการ)</span>
                      </summary>
                      <div className="mt-2 max-h-48 overflow-y-auto pr-1 space-y-1 divide-y divide-slate-100 bg-white p-2.5 rounded-xl border border-slate-200">
                        {job.result.violations.map((v, i) => (
                          <div key={i} className="pt-1 text-[10px] flex items-start justify-between gap-2">
                            <div>
                              <span className={`font-bold px-1 rounded text-[9px] mr-1 ${v.severity === "error" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                                {v.ruleCode}
                              </span>
                              <span className="text-slate-600">{v.date ? `${v.date} ` : ""}{v.subjectId ? `(${v.subjectId}) ` : ""}: {v.message}</span>
                            </div>
                            <span className="text-slate-400 shrink-0">{v.severity}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })()}

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center justify-between gap-2 shadow-2xs animate-fade-in">
                  <span>❌ {error}</span>
                  <button
                    type="button"
                    onClick={() => setError("")}
                    className="text-rose-500 hover:text-rose-800 text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
                <div className="text-xs text-slate-500">
                  {job.result.status === "complete"
                    ? "✨ ตารางเวรพร้อมใช้งาน สามารถกดปุ่มบันทึกลงตารางเวรจริงได้ทันที"
                    : job.result.diagnostics?.regularSearchStatus === "search_incomplete" || job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                    ? "⚠️ จะลงตารางที่ดีที่สุดเท่าที่จัดได้ พร้อมแสดงรายการเวรที่ยังขาด"
                    : "⚠️ ตารางเวรยังไม่สมบูรณ์"}
                </div>
                <button
                  type="button"
                  disabled={
                    busy ||
                    job.applied ||
                    job.status !== "completed" ||
                    !(
                      job.result.status === "complete" ||
                      job.result.diagnostics?.regularSearchStatus === "search_incomplete" ||
                      job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                    )
                  }
                  onClick={() =>
                    void action(async () => {
                      const latest = await request<Job>(`/jobs/${job.id}`, token);
                      const result = await request<RosterResponse>(`/jobs/${job.id}/apply`, token, "POST", {});
                      setJob({ ...latest, applied: true });
                      onApplied(result);
                    })
                  }
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold transition shadow-md flex items-center gap-2 ${
                    job.applied
                      ? "bg-slate-200 text-slate-500 cursor-default"
                      : job.result.status === "complete" ||
                        job.result.diagnostics?.regularSearchStatus === "search_incomplete" ||
                        job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 active:scale-95 cursor-pointer"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  }`}
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  <span>{job.applied ? "✅ ใช้ผลกับตารางแล้ว" : "💾 นำผล AUTO ไปใช้กับตารางเวรจริง"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
