"use client";
import { useEffect, useState, useRef } from "react";
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
} from "@heroicons/react/24/outline";
import type { Cell, Roster, RosterResponse, Violation } from "@/types/schedule";
import { formatThaiMonthYear } from "@/lib/dateUtils";

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

function canApplyJob(job: Job | null): boolean {
  if (!job || job.status !== "completed" || job.applied || job.stale || job.simulation || !job.result) return false;
  return job.result.status === "complete" ||
    job.result.diagnostics?.regularSearchStatus === "search_incomplete" ||
    job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven";
}

interface SolverPanelProps {
  roster: Roster;
  token: string;
  wardName?: string;
  onApplied: (data: RosterResponse) => void;
  onRosterUpdated?: (data: RosterResponse) => void;
  onFixIssue?: (path: string) => void;
  onBackToGrid?: () => void;
}


export function SolverPanel({ roster, token, wardName, onApplied, onRosterUpdated, onFixIssue }: SolverPanelProps) {
  const [ready, setReady] = useState<Readiness | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [multiPlans, setMultiPlans] = useState<MultiPlanOption[] | null>(null);
  const [selectedPlanProfile, setSelectedPlanProfile] = useState<string>("balanced");
  const [simulation, setSimulation] = useState(false);
  const allowPartTime = true;
  const maxPartTimeRN = 2;
  const maxPartTimePN = 1;
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
    payload: Roster["policy"] | null;
  } | null>(null);

  const actionPending = useRef(false);
  const active = job?.status === "pending" || job?.status === "running";

  async function action(work: () => Promise<void>) {
    if (actionPending.current) return;
    actionPending.current = true;
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
      actionPending.current = false;
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

  // Ignore obsolete checks after changing schedules or simulation mode.
  useEffect(() => {
    const controller = new AbortController();
    void request<Readiness>(`/schedules/${roster.id}/readiness-check`, token, "POST", { simulation }, controller.signal)
      .then(setReady)
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "ตรวจความพร้อมไม่สำเร็จ กรุณาลองอีกครั้ง"); });
    return () => controller.abort();
  }, [roster.id, roster.version, token, simulation]);

  async function check() {
    setReady(null);
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
    const existingTargetMap = new Map((currentPolicy.targets || []).map((t) => [(t as { nurseId: string }).nurseId, t]));
    const missingTargets = activeStaff.filter((n) => !existingTargetMap.has(n.id));
    if (missingTargets.length > 0) {
      actions.push(`กำหนดเป้าหมายชั่วโมงและวันหยุดมาตรฐานให้บุคลากรที่ยังไม่มี (${missingTargets.length} คน: ${minOff} วัน OFF, ${(daysInMonth - minOff) * 8} ชม.)`);
      const fullTargets = activeStaff.map((n) => {
        const existing = existingTargetMap.get(n.id);
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
      " รักษายอดอัตรากำลังที่ต้องการ (Staffing Requirements) ตามที่หน่วยงานกำหนด ไม่ปรับลด",
      " รักษาสิทธิ์ขึ้นเวร สิทธิ์เวรควบ และทักษะเฉพาะของบุคลากรตามจริง ไม่บังคับเปิดสิทธิ์",
      " ไม่แต่งประวัติเวรย้อนหลัง (Boundary) เองโดยพลการ",
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
        setSuccessNotice(" ปรับปรุงความพร้อมเรียบร้อย! ข้อมูลพร้อมสำหรับจัดเวร โดยคงข้อกำหนดจริงของหน่วยงานไว้ทั้งหมด");
      } else {
        setSuccessNotice("ปรับปรุงนโยบายเรียบร้อยแล้ว แต่ยังมีข้อผิดพลาด/ข้อมูลที่ต้องบันทึกจริงตามรายการด้านล่าง");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setFixing(false);
    }
  }

  async function continueSearch() {
    await action(async () => {
                                const report = await check();
                                if (!report.ready || !job || job.stale) return;
                                setJob(
                                  await request<Job>(`/schedules/${roster.id}/${job.simulation ? "simulate" : "generate"}`, token, "POST", {
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

    });
  }

  return (
    <div className="space-y-6 text-sm leading-relaxed">
      {/* 1. Readiness & 1-Click Fix Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-6 w-6 text-blue-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                1. ความพร้อม
              </h4>
              <p className="text-sm text-slate-500">
                ระบบตรวจสอบข้อมูลกฎเวร, เวรย้อนหลัง, เป้าหมายรายบุคคล และสิทธิ์การขึ้นเวร
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void action(async () => { await check(); })}
            disabled={busy || fixing || active}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-sm font-bold transition flex items-center gap-1.5"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            <span>ตรวจความพร้อมอีกครั้ง</span>
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
                    </button>
        </div>

        {!ready && <p role="status">{error ? "ยังตรวจความพร้อมไม่สำเร็จ กดตรวจความพร้อมอีกครั้ง" : "กำลังตรวจความพร้อม…"}</p>}
        {ready && !ready.ready && <p className="text-amber-800">แก้รายการด้านล่างก่อนเริ่มจัดเวร ระบบจะตรวจความพร้อมอีกครั้งเมื่อกดเริ่ม</p>}
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer font-medium">รายละเอียดการวิเคราะห์กำลังคนเบื้องต้น</summary>
          <p className="mt-2 text-slate-600">เป็นค่าประมาณ ไม่ใช่ผลยืนยันว่าจัดเวรได้ครบหรือขาดคน</p>
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


          const rnUtilization = activeRN > 0 ? (dailyReqRN / activeRN) : 0;
          const isRNTightRotation = dailyReqRN > 0 && rnDeficit <= 0 && rnUtilization >= 0.65;

          return (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span> วิเคราะห์ความสมดุลกำลังคนประจำเดือน ({daysInMonth} วัน)</span>
                </span>
                {onFixIssue && (
                  <button
                    type="button"
                    onClick={() => onFixIssue("/settings/roster-policy")}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 cursor-pointer"
                  >
                    <span> ปรับนโยบายอัตรากำลัง</span>
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
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
                  <div className="flex items-center justify-between font-bold text-sm">
                    <span>พยาบาลวิชาชีพ (RN {activeRN} คน)</span>
                    <span className={`px-1.5 py-0.5 rounded text-sm font-extrabold ${
                      dailyReqRN > 0 && rnDeficit > 0
                        ? "bg-rose-200 text-rose-900"
                        : isRNTightRotation
                        ? "bg-amber-200 text-amber-950"
                        : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {dailyReqRN > 0 && rnDeficit > 0
                        ? ` ขาด ${rnDeficit} เวร`
                        : isRNTightRotation
                        ? ` ตึงตัววิกฤต (${Math.round(rnUtilization * 100)}%)`
                        : ` เพียงพอ (+${maxCapRN - monthlyReqRN} เวร)`}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 mt-1">
                    ต้องการวันละ {dailyReqRN} คน ({monthlyReqRN} เวร/เดือน) | ศักยภาพ {maxCapRN} เวร
                  </div>
                </div>

                {/* PN Card */}
                <div className={`p-2.5 rounded-lg border ${dailyReqPN > 0 && pnDeficit > 0 ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-slate-50 border-slate-200 text-slate-800"}`}>
                  <div className="flex items-center justify-between font-bold text-sm">
                    <span>ผู้ช่วยพยาบาล (PN {activePN} คน)</span>
                    <span className={`px-1.5 py-0.5 rounded text-sm font-extrabold ${dailyReqPN > 0 && pnDeficit > 0 ? "bg-rose-200 text-rose-900" : "bg-emerald-100 text-emerald-800"}`}>
                      {dailyReqPN > 0 && pnDeficit > 0 ? ` ขาด ${pnDeficit} เวร` : ` เพียงพอ (+${maxCapPN - monthlyReqPN} เวร)`}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 mt-1">
                    ต้องการวันละ {dailyReqPN} คน ({monthlyReqPN} เวร/เดือน) | ศักยภาพ {maxCapPN} เวร
                  </div>
                </div>
              </div>

              {isRNTightRotation && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex items-start gap-2">
                  <span className="shrink-0 text-sm"></span>
                  <div>
                    <span className="font-bold">ข้อสังเกตความตึงตัว: </span>
                    สัดส่วนขึ้นเวรต่อวันสูงถึง {Math.round(rnUtilization * 100)}% (ต้องการ {dailyReqRN} จาก {activeRN} คน) การหมุนเวร 3 ผลัดที่มีเวรดึกต้องใช้คนอย่างน้อย {Math.ceil(dailyReqRN * 1.45)} คน จึงจะหมุนเวรได้โดยไม่ติดกฎเวลาพัก ระบบจะใช้เวรควบ (ชบ 16 ชม.) ที่ได้รับอนุญาตช่วยในการจัดเวร
                  </div>
                </div>
              )}

              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-900 flex items-start gap-2">
                <span className="shrink-0 text-sm"></span>
                <div>
                  <span className="font-bold">หลักการประเมินและจัดตารางเวร: </span>
                  ระบบประเมินกำลังคนจากวันลาจริง สิทธิ์ขึ้นเวร ทักษะเฉพาะ และวันหยุด โดยตัวค้นหาจะลองสลับเวร ย้ายวัน OFF ที่ไม่ล็อก และเปิดใช้เวรควบที่ได้รับอนุญาต เพื่อเติมเต็มอัตรากำลังของวอร์ดให้ครบถ้วนโดยไม่ละเมิดกฎความปลอดภัย
                </div>
              </div>
            </div>
          );
        })()}

        </details>
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
                <span className="text-sm font-bold">
                  {ready.ready ? "พร้อมจัดเวร" : `ต้องแก้ไขข้อมูล ${ready.issues.length} รายการ`}
                </span>
              </div>

              {!ready.ready && (
                <button
                  type="button"
                  onClick={() => prepareAutoReady()}
                  disabled={fixing || busy}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <WrenchScrewdriverIcon className={`h-4 w-4 ${fixing ? "animate-spin" : ""}`} />
                  <span>ดูข้อเสนอเตรียมข้อมูล</span>
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
                    </button>
              )}
            </div>

            {/* Auto Ready Advisor Confirmation Modal */}
            {showAutoReadyModal && autoReadyPlan && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">

                      <div>
                        <h3 className="text-sm font-bold text-slate-900">ข้อเสนอเตรียมข้อมูล</h3>
                        <p className="text-sm text-slate-500">ตรวจสอบรายการและผลกระทบก่อนยืนยันดำเนินการ</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAutoReadyModal(false)}
                      className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                    >
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                        <span> รายการที่จะดำเนินการปรับปรุง:</span>
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
                        <span> สิ่งที่ระบบคงไว้ตามเดิม (ไม่แก้ไขข้อมูลต้นทาง):</span>
                      </div>
                      <ul className="space-y-1 bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-emerald-900">
                        {autoReadyPlan.guarantees.map((g, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-600 font-bold"></span>
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
                      className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyAutoReady()}
                      disabled={fixing}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50"
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
                <div className="text-sm font-bold text-slate-600">
                  รายการข้อผิดพลาดที่พบ ({ready.issues.length} รายการ):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ready.issues.map((i, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-rose-200 rounded-xl text-sm space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-rose-700 text-sm bg-rose-100 px-1.5 py-0.5 rounded">
                          {i.code}
                        </span>
                        {onFixIssue && (
                          <button
                            type="button"
                            onClick={() => onFixIssue(i.fixPath)}
                            className="text-sm text-blue-600 hover:text-blue-800 underline font-semibold"
                          >
                            เปิดหน้าแก้ไข
                          </button>
                        )}
                      </div>
                      <div className="text-slate-800 font-medium text-sm">{i.message}</div>
                      <div className="text-sm text-slate-400">
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
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 font-semibold flex items-center justify-between gap-2 animate-fade-in">
            <span>{successNotice}</span>
            <button
              type="button"
              onClick={() => setSuccessNotice("")}
              className="text-emerald-600 hover:text-emerald-900 text-sm font-bold"
            >
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
                    </button>
          </div>
        )}

        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>

      {/* 2. Scope & Settings Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-6 w-6 text-indigo-600 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-slate-800">
              2. เริ่มจัดเวร
            </h4>
            <p className="text-sm text-slate-500">
              ค่าเริ่มต้น: จัดทั้งเดือนสำหรับบุคลากรทุกคน ช่องที่ล็อกไว้จะคงเดิม
            </p>
          </div>
        </div>

        <p className="text-slate-700">{wardName || roster.wardId} · {formatThaiMonthYear(roster.month, roster.year)} · {start || "ต้นเดือน"} ถึง {end || "สิ้นเดือน"} · {nurseIds.length || roster.staff.filter(n => n.active).length} คน{simulation ? " · โหมดจำลอง (บันทึกไม่ได้)" : ""}</p>
        <details className="rounded-lg border border-slate-200 p-4">
          <summary className="cursor-pointer font-medium">ตัวเลือกเพิ่มเติม</summary>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
              <input
                type="checkbox"
                disabled={busy || active}
                checked={simulation}
                onChange={(e) => {
                  setSimulation(e.target.checked);
                  setReady(null);
                }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-bold text-slate-800"> โหมดจำลองผลลัพธ์ </span>
                <p className="text-sm text-slate-500">
                  ทดลองจัดเวรโดยยอมรับชุดตั้งค่าแบบร่าง เพื่อดูคะแนนและแนวโน้มตารางเวร
                </p>
              </div>
            </label>


          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              วันที่เริ่ม (เว้นว่าง = ต้นเดือน):
            </label>
            <input
              type="date"
              aria-label="วันที่เริ่มจัดเวร"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={busy || active}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              วันที่สิ้นสุด (เว้นว่าง = สิ้นเดือน):
            </label>
            <input
              type="date"
              aria-label="วันที่สิ้นสุดจัดเวร"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={busy || active}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              บุคลากร ({nurseIds.length === 0 ? "ทุกคนในวอร์ด" : `${nurseIds.length} คน`}):
            </label>
            <select
              multiple
              aria-label="บุคลากรที่ต้องการจัดเวร"
              value={nurseIds}
              onChange={(e) => setNurseIds(Array.from(e.target.selectedOptions, (x) => x.value))}
              disabled={busy || active}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-800 font-medium h-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            {/* Multi-Plan Generation Button */}
            <button
              type="button"
              disabled={busy || fixing || active || simulation || !ready?.ready}
              onClick={() =>
                void action(async () => {
                  const report = await check();
                  if (!report.ready || simulation) return;
                  setJob(null);
                  setMultiPlans(null);
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
                  if (!res.plans?.length) throw new Error("ไม่พบแผนจัดเวร กรุณาลองใหม่");
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
              className={`disabled:opacity-50 disabled:cursor-not-allowed mt-4 px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
                ready?.ready
                  ? "bg-blue-600 hover:bg-blue-700 text-white active:scale-95 cursor-pointer"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
              }`}
            >
              <SparklesIcon className="h-4 w-4" />
              <span>เปรียบเทียบ 3 แผน</span>
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
                    </button>          {simulation && <p className="mt-2 text-slate-600">ปิดโหมดจำลองก่อนเปรียบเทียบ 3 แผน</p>}
        </details>
        {/* Start Buttons */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-slate-500">
             ช่องที่ล็อกเวรไว้  และช่องที่อยู่นอกขอบเขตจะคงเดิม ไม่ถูกแก้ไข
          </span>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Single Solve Button */}
            <button
              type="button"
              disabled={busy || fixing || active || !ready?.ready}
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
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition border flex items-center gap-2 ${
                ready?.ready
                  ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 cursor-pointer"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <PlayIcon className="h-4 w-4" />
              <span>{simulation ? "เริ่มจำลองตาราง" : "เริ่มจัดเวรอัตโนมัติ"}</span>
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
                    </button>


          </div>
        </div>
      </div>

      {/* Multi-Plan Comparison Section */}
      {multiPlans && multiPlans.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">

              <div>
                <h3 className="text-sm font-extrabold text-indigo-950 flex items-center gap-2">
                  <span>เปรียบเทียบแผนตารางเวร</span>
                  <span className="text-sm bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                    เลือกดูแผน แล้วตรวจผลก่อนบันทึกลงตาราง
                  </span>
                </h3>
                <p className="text-sm text-slate-600 mt-0.5">
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
              const theme = {
                border: isSelected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200",
                badge: "bg-blue-50 text-blue-800",
              };

              return (
                <div
                  key={p.profile}

                  className={`bg-white rounded-2xl border transition-all p-4 flex flex-col justify-between ${theme.border}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">

                        <div>
                          <span className={`text-sm font-extrabold uppercase px-2 py-0.5 rounded-md ${theme.badge}`}>
                            {isSelected ? "แผนที่เลือก" : "ทางเลือก"}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 mt-1">{p.title}</h4>
                        </div>
                      </div>

                    </div>

                    <p className="text-sm text-slate-500 leading-relaxed min-h-[32px]">{p.description}</p>

                    {/* Metrics Highlights Table */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">คะแนนความเท่าเทียม :</span>
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
                        <span className="text-slate-500 font-medium">ส่วนเบี่ยงเบน ชม. :</span>
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
                      disabled={busy || active}
                      aria-pressed={isSelected}
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
                      className={`text-sm font-bold px-3 py-1.5 rounded-lg border transition ${
                        isSelected
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {isSelected ? "กำลังเลือกแผนนี้" : "เลือกดูแผนนี้"}
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
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base"></span>
              <span role="status" className="text-sm font-bold text-slate-800">
                สถานะงานจัดเวร: <span className="text-blue-600 font-extrabold capitalize">{{ pending: "รอประมวลผล", running: "กำลังจัดเวร", completed: "จัดเวรเสร็จแล้ว", failed: "จัดเวรไม่สำเร็จ", cancelled: "ยกเลิกแล้ว" }[job.status] || "กำลังตรวจสถานะ"}</span>
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
                className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-sm font-bold transition"
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
              style={{ width: `${Math.max(0, Math.min(100, job.progress ?? 0))}%` }}
            />
          </div>

          {job.error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-semibold">
              เกิดข้อผิดพลาด: {job.error}
            </div>
          )}

          {job.stale && !job.applied && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 font-semibold">
               ผลการจัดเวรนี้ล้าสมัย เนื่องจากข้อมูลหรือกฎถูกเปลี่ยนแปลงระหว่างรัน กรุณากดจัดใหม่อีกครั้ง
            </div>
          )}

          {/* 4. Results & Score Board */}
          {job.result && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span>3. ผลการจัดเวร</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-sm font-extrabold ${
                        job.result.status === "complete"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {job.result.status === "complete" ? "จัดครบ" : "ยังจัดไม่ครบ"}
                    </span>
                  </h4>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {job.result.status === "complete"
                      ? "จัดตารางครบแล้ว ตรวจผลก่อนบันทึก จากนั้นยังต้องอนุมัติและประกาศใช้"
                      : "ยังจัดไม่ครบ ตรวจเหตุผลและเวรที่ยังขาดด้านล่างก่อนดำเนินการต่อ"}
                  </p>
                </div>
              </div>

              <p className="font-medium">เวรที่ยังขาด {(job.result.diagnostics?.remainingShortages ?? job.result.diagnostics?.shortages ?? []).reduce((sum, item) => sum + item.missing, 0)} เวร · ข้อผิดพลาด {job.result.violations.filter(v => v.severity === "error").length} รายการ</p>
              <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer font-medium">รายละเอียดคะแนนการวิเคราะห์</summary>
              {/* Score Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { key: "total", label: "คะแนนรวม ", color: "from-blue-600 to-indigo-600" },
                  { key: "coverage", label: "ความครบถ้วน ", color: "from-teal-600 to-emerald-600" },
                  { key: "fairness", label: "ความเป็นธรรม ", color: "from-indigo-600 to-purple-600" },
                  { key: "preference", label: "ความพึงพอใจ ", color: "from-amber-600 to-orange-600" },
                  { key: "stability", label: "ความนิ่งตาราง ", color: "from-slate-600 to-slate-800" },
                ].map(({ key, label }) => {
                  const beforeVal = job.before?.[key as keyof Score] ?? 0;
                  const afterVal = job.result?.score?.[key as keyof Score] ?? 0;
                  const diff = afterVal - beforeVal;

                  return (
                    <div
                      key={key}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between"
                    >
                      <div className="text-sm font-bold text-slate-600 truncate">{label}</div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-base font-extrabold text-slate-900">{afterVal.toFixed(1)}</span>
                        {!multiPlans && diff !== 0 && (
                          <span
                            className={`text-sm font-bold ${
                              diff > 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {!multiPlans && <div className="text-sm text-slate-500 mt-1">เดิม: {beforeVal.toFixed(1)}</div>}
                    </div>
                  );
                })}
              </div>

              </details>
              {/* Proposed Assignments Table (Collapsible) */}
              <details className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
                <summary className="font-bold text-slate-800 cursor-pointer select-none">
                   ดูตารางข้อเสนอที่จัดได้ ({job.result.assignments.length} ช่องเวร)
                </summary>
                <div className="mt-3 max-h-60 overflow-y-auto pr-1">
                  <div className="grid grid-cols-[100px_1fr_60px] gap-2 font-bold text-slate-500 pb-1 border-b text-sm">
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
                          className="grid grid-cols-[100px_1fr_60px] gap-2 items-center py-1.5 text-sm"
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
                      <div className="p-3.5 bg-white border border-emerald-300 rounded-2xl flex items-center gap-3">

                        <div>
                          <div className="font-bold text-emerald-800 text-sm">จัดคนประจำครบทั้งเดือน</div>
                          <div className="text-sm text-emerald-700 mt-0.5">ระบบจัดเวรครบทุกผลัดโดยใช้บุคลากรประจำเท่านั้น ไม่ต้องการ Part-time</div>
                        </div>
                      </div>
                    )}

                    {/* กลุ่ม 2: ยังค้นหาไม่จบ */}
                    {rss === "search_incomplete" && (
                      <div className="p-3.5 bg-white border border-amber-300 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">⏳</span>
                            <div>
                              <div className="font-bold text-amber-800 text-sm">ยังค้นหาไม่จบภายในเวลาที่กำหนด</div>
                              <div className="text-sm text-amber-700 mt-0.5">
                                แสดงตารางที่ดีที่สุดที่พบ — ยังไม่สามารถยืนยันว่าคนประจำไม่พอจริง สามารถค้นหาต่อได้
                              </div>
                            </div>
                          </div>
                          {canContinue && (
                            <button
                              type="button"
                              disabled={busy || active || job.stale}
                              onClick={() => void continueSearch()}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                              <ArrowPathIcon className="h-3.5 w-3.5" />
                              <span> ค้นหาต่อ </span>
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
                    </button>
                          )}
                        </div>
                        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                           ขอบเขตการค้นหาครอบคลุมเฉพาะรอบนี้ — การหมดเวลาไม่ใช่หลักฐานว่าจัดไม่ได้
                        </div>
                      </div>
                    )}

                    {/* กลุ่ม 3: ยืนยันเวรเหลือสำหรับ Part-time */}
                    {rss === "minimum_shortage_proven" && ptReqs.length > 0 && (
                      <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2.5">

                          <div>
                            <div className="font-bold text-rose-800 text-sm flex items-center gap-2">
                              <span>ยืนยันเวรที่ต้องการ Part-time ({ptReqs.length} รายการ)</span>
                              <span className="text-sm bg-rose-200 text-rose-900 font-extrabold px-2 py-0.5 rounded-full"> พิสูจน์แล้วว่าจัดไม่ครบด้วยคนประจำ</span>
                            </div>
                            <div className="text-sm text-rose-700 mt-0.5">
                              ระบบพิสูจน์แล้วว่าคนประจำไม่เพียงพอสำหรับเวรต่อไปนี้ — กรุณาติดต่อจัดหาบุคลากร Part-time จริง
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {ptReqs.map((req, idx) => (
                            <div key={idx} className="p-3 bg-white border border-rose-200 rounded-xl space-y-2">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-sm">วันที่ {req.date}</span>
                                  <span className="font-bold text-slate-800 text-sm">
                                    ผลัด {req.shiftCode || "ไม่ระบุ"} | ต้องการ {req.position} {req.missing} คน
                                    {req.missingLeader && <span className="ml-1 text-sm bg-purple-100 text-purple-800 px-1.5 rounded-full font-bold">รวมหัวหน้าเวร</span>}
                                  </span>
                                </div>
                                {req.missingSkills && Object.keys(req.missingSkills).length > 0 && (
                                  <span className="text-sm bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                                    ขาดทักษะ: {Object.entries(req.missingSkills).map(([k, v]) => `${k} (${v})`).join(", ")}
                                  </span>
                                )}
                              </div>
                              {req.constraintEvidence && req.constraintEvidence.length > 0 && (
                                <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg space-y-1">
                                  <div className="font-bold text-slate-700">หลักฐานข้อจำกัดจริง (ทำไมคนประจำจัดลงไม่ได้):</div>
                                  <ul className="list-disc list-inside space-y-0.5 text-sm">
                                    {req.constraintEvidence.map((ev, eIdx) => (
                                      <li key={eIdx}>{ev}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
                           รายการนี้ยังเป็นเวรว่าง บันทึกผลบางส่วนเพื่อจัดต่อได้ แต่ต้องเติมบุคลากรให้ครบก่อนอนุมัติและประกาศใช้
                        </div>
                      </div>
                    )}

                    {/* กลุ่มพิเศษ: ข้อมูลล็อกขัดกฎ */}
                    {rss === "invalid_fixed_data" && (
                      <div className="p-3.5 bg-red-50 border border-red-300 rounded-2xl flex items-start gap-3">
                        <span className="text-2xl shrink-0"></span>
                        <div>
                          <div className="font-bold text-red-800 text-sm">พบข้อมูลล็อกที่ขัดกฎข้อบังคับ</div>
                          <div className="text-sm text-red-700 mt-0.5">
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
                <div className="p-3.5 bg-white border border-purple-200 rounded-2xl text-sm text-purple-950 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl"></span>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        <span>
                          จัดเวรเสริมอัตโนมัติ (Part-time Relief): {job.result.diagnostics.partTimeNurses ?? 1} คน (รวม {job.result.diagnostics.partTimeShifts} เวร)
                        </span>
                      </div>
                      <div className="text-sm text-purple-700 mt-0.5">ผลจากงานเก่า (pre-Sprint 5)</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shortage Diagnostics (legacy / remaining shortages) */}
              {(job.result.diagnostics?.remainingShortages ?? job.result.diagnostics?.shortages ?? []).length > 0 && (
                <div className="space-y-3 p-4 bg-rose-50/80 border border-rose-200 rounded-2xl text-sm text-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 text-base bg-rose-100 text-rose-700 border border-rose-300">

                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <span>รายงานวิเคราะห์ช่องขาดและทางเลือกสำหรับหัวหน้าวอร์ด</span>
                          <span
                            className={`text-sm font-extrabold px-2 py-0.5 rounded-full ${
                              job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                                ? "bg-rose-200 text-rose-900"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                              ? " พิสูจน์แล้วว่าจัดไม่ครบตามเงื่อนไขจริง"
                              : "ยังค้นหาไม่พบภายในเวลางบประมาณ (แสดงผลลัพธ์ที่ดีที่สุด)"}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">
                          ระบบได้ทดลองสลับเวร ย้ายวัน OFF และใช้เวรควบตามสิทธิ์แล้ว แต่ยังติดข้อบังคับในบางจุด ดังนี้:
                        </p>
                      </div>
                    </div>
                  </div>

                  <details className="space-y-2 pt-1">
                    <summary className="cursor-pointer font-medium">ดูเวรที่ยังขาดและสาเหตุรายวัน</summary>
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
                            <span className="text-sm bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                              ขาดทักษะ: {Object.entries(sh.missingSkills).map(([k, v]) => `${k} (${v})`).join(", ")}
                            </span>
                          )}
                        </div>

                        {sh.blockingRules && sh.blockingRules.length > 0 && (
                          <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg space-y-1">
                            <div className="font-bold text-slate-700">สาเหตุที่พยาบาลท่านอื่นจัดลงไม่ได้ (ติดกฎข้อบังคับ):</div>
                            <ul className="list-disc list-inside space-y-0.5 text-sm">
                              {sh.blockingRules.map((b, bIdx) => (
                                <li key={bIdx}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {sh.suggestions && sh.suggestions.length > 0 && (
                          <div className="text-sm text-emerald-800 bg-emerald-50/70 p-2 rounded-lg space-y-1 border border-emerald-200">
                            <div className="font-bold flex items-center gap-1 text-emerald-900">
                              <span> ทางเลือกสำหรับหัวหน้าวอร์ด:</span>
                            </div>
                            <ul className="list-disc list-inside space-y-0.5 text-sm">
                              {sh.suggestions.map((s, sIdx) => (
                                <li key={sIdx}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </details>
                </div>
              )}

              {job.result.violations.some(v => v.severity === "error") && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <h4 className="font-semibold text-rose-800">ข้อผิดพลาดที่ต้องแก้ไข</h4>
                <ul className="mt-2 list-disc space-y-2 pl-5">{job.result.violations.filter(v => v.severity === "error").map((v, i) => <li key={i}>{v.date} {v.message}</li>)}</ul>
              </div>}
              {job.result.violations.some(v => v.severity === "warning") && <details className="rounded-lg border border-slate-200 p-4">
                <summary className="cursor-pointer font-medium">ข้อสังเกตเพิ่มเติม {job.result.violations.filter(v => v.severity === "warning").length} รายการ</summary>
                <ul className="mt-3 list-disc space-y-2 pl-5">{job.result.violations.filter(v => v.severity === "warning").map((v, i) => <li key={i}>{v.date} {v.message}</li>)}</ul>
              </details>}
              {job.simulation && <p role="status" className="rounded-lg bg-blue-50 p-3 text-blue-800">เป็นผลจำลองสำหรับตรวจสอบเท่านั้น ไม่สามารถบันทึกลงตารางได้</p>}
              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
                <div className="text-sm text-slate-500">
                  {job.result.status === "complete"
                    ? "หลังบันทึกผล ยังต้องตรวจ อนุมัติ และประกาศใช้"
                    : job.result.diagnostics?.regularSearchStatus === "search_incomplete" || job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                    ? " จะลงตารางที่ดีที่สุดเท่าที่จัดได้ พร้อมแสดงรายการเวรที่ยังขาด"
                    : " ตารางเวรยังไม่สมบูรณ์"}
                </div>
                <button
                  type="button"
                  disabled={busy || !canApplyJob(job)}
                  onClick={() =>
                    void action(async () => {
                      const latest = await request<Job>(`/jobs/${job.id}`, token);
                      setJob(latest);
                      if (!canApplyJob(latest)) {
                        throw new Error("ผลนี้ยังบันทึกไม่ได้ กรุณาตรวจสถานะหรือจัดเวรใหม่");
                      }
                      const result = await request<RosterResponse>(`/jobs/${job.id}/apply`, token, "POST", {});
                      setJob({ ...latest, applied: true });
                      onApplied(result);
                    })
                  }
                  className={`disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
                    job.applied
                      ? "bg-slate-200 text-slate-500 cursor-default"
                      : job.result.status === "complete" ||
                        job.result.diagnostics?.regularSearchStatus === "search_incomplete" ||
                        job.result.diagnostics?.regularSearchStatus === "minimum_shortage_proven"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 cursor-pointer"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  }`}
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  <span>{job.applied ? "บันทึกผลแล้ว" : job.simulation ? "ผลจำลองบันทึกไม่ได้" : job.stale ? "กรุณาจัดเวรใหม่" : job.result.status === "complete" ? "บันทึกผลลงตาราง" : "บันทึกผลที่ยังจัดไม่ครบ"}</span>
                      <XMarkIcon className="h-5 w-5" aria-label="ปิด" />
                    </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
