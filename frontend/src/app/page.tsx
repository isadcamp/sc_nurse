"use client";
import Image from "next/image";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { CalendarDaysIcon, UsersIcon, CalendarIcon, Cog6ToothIcon, ChartBarIcon, SparklesIcon, ArrowLeftOnRectangleIcon, Bars3Icon, PlusIcon, PrinterIcon, ExclamationTriangleIcon, InformationCircleIcon, MagnifyingGlassIcon, XMarkIcon, ClipboardDocumentCheckIcon, BuildingOffice2Icon, ArrowPathIcon, CheckCircleIcon, ShieldCheckIcon, BackspaceIcon, BanknotesIcon, TrashIcon } from "@heroicons/react/24/outline";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { SidePanel } from "@/components/ui/SidePanel";
import { request } from "@/lib/api";
import { SolverPanel } from "@/features/solver/SolverPanel";
import { PolicyPanel } from "@/features/policy/PolicyPanel";
import { StaffPanel } from "@/features/staff/StaffPanel";
import { DepartmentPanel } from "@/features/ward/DepartmentPanel";
import { HolidayPanel } from "@/features/holidays/HolidayPanel";
import { BoundaryPanel } from "@/features/boundary/BoundaryPanel";
import { CompensationPanel } from "@/features/compensation/CompensationPanel";
import { CompensationModal } from "@/features/compensation/CompensationModal";
import { DashboardPanel } from "@/features/dashboard/DashboardPanel";
import { AnnualOverviewPanel } from "@/features/overview/AnnualOverviewPanel";
import { AIPanel } from "@/features/ai/AIPanel";
import { WardModal } from "@/features/ward/WardModal";
import { DepartmentManagementModal } from "@/features/ward/DepartmentManagementModal";
import { UserManagementModal } from "@/features/users/UserManagementModal";
import { UserManagementPanel } from "@/features/users/UserManagementPanel";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { StaffModal } from "@/features/staff/StaffModal";
import { HolidayModal } from "@/features/holidays/HolidayModal";
import { LeaveModal } from "@/features/leave/LeaveModal";
import { LeavePanel } from "@/features/leave/LeavePanel";
import { BoundaryModal } from "@/features/boundary/BoundaryModal";
import { ShiftBadge, SHIFT_CONFIGS } from "@/components/schedule/ShiftBadge";
import { getShiftOptions } from "@/components/schedule/shiftOptions";
import { QuickShiftPicker } from "@/components/schedule/QuickShiftPicker";
import { CoverageSummaryRow, computeRosterDailyCoverage } from "@/components/schedule/CoverageSummaryRow";
import { NurseStatsColumn } from "@/components/schedule/NurseStatsColumn";
import { PayrollDrilldownModal } from "@/features/dashboard/PayrollDrilldownModal";
import { OfficialRosterPrint } from "@/components/print/OfficialRosterPrint";
import { formatThaiMonthYear, THAI_MONTH_SHORT, toBuddhistYear } from "@/lib/dateUtils";
import type { Cell, Edit, Nurse, RosterResponse, ScheduleSummary, Violation, Ward, Staff } from "@/types/schedule";

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string; icon: string }> = {
  draft: { label: "ร่าง (Draft)", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300", icon: "📝" },
  generated: { label: "สร้างแล้ว (Generated)", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-300", icon: "✨" },
  under_review: { label: "รอตรวจ/อนุมัติ (Under Review)", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300", icon: "⏳" },
  approved: { label: "อนุมัติแล้ว (Approved)", bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-300", icon: "✅" },
  published: { label: "ประกาศใช้แล้ว (Published)", bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", icon: "📢" },
  closed: { label: "ปิดงวดบัญชีแล้ว (Closed)", bg: "bg-slate-300", text: "text-slate-900", border: "border-slate-400", icon: "🔒" },
};

export default function Home() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [actor, setActor] = useState<{ id: string; role: string; displayName?: string; wards?: string[] } | null>(null);
  const [ward, setWard] = useState("ward-1");
  const [wards, setWards] = useState<Ward[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<RosterResponse | null>(null);
  const [versions, setVersions] = useState<ScheduleSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Views & Panels
  const [activeTab, setActiveTab] = useState<"grid" | "dashboard" | "ai" | "solver" | "policy">("grid");
  const [activeWorkspace, setActiveWorkspace] = useState<
    "home" | "annual" | "preflight" | "schedule" | "solver" | "policy" | "review" | "overview" | "proposals" | "approval" | "staff" | "departments" | "holidays" | "boundary" | "compensation" | "leave" | "users"
  >("home");
  const [violationFilter, setViolationFilter] = useState<"all" | "error" | "warning">("all");
  const [violationQuery, setViolationQuery] = useState("");
  const [showWardModal, setShowWardModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [showBoundaryModal, setShowBoundaryModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showDrilldownModal, setShowDrilldownModal] = useState(false);
  const [drilldownNurse, setDrilldownNurse] = useState<Staff | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);

  // Unpublish Modal State
  const [showUnpublishModal, setShowUnpublishModal] = useState(false);
  const [unpublishReason, setUnpublishReason] = useState("");
  const [unpublishTargetId, setUnpublishTargetId] = useState<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const update = () => setShowLeftPanel(!media.matches);
    queueMicrotask(update);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Quick Shift Popover State
  const [activeCell, setActiveCell] = useState<{ cell: Cell; targetRect: DOMRect } | null>(null);

  // Brush Paint Mode State
  const [brushMode, setBrushMode] = useState<boolean>(false);
  const [activeBrush, setActiveBrush] = useState<string>("ช");

  // Workflow Dialog
  const [actionText, setActionText] = useState("");

  const roster = data?.schedule;
  const isAdmin = actor?.role === "admin";
  const isHead = actor?.role === "head" || isAdmin;
  const canEdit = isHead && (roster?.status === "draft" || roster?.status === "generated");
  const editPending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  const [staffViewFilter, setStaffViewFilter] = useState<"all" | "rn" | "pn">("all");

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = Number.isFinite(year) && mon >= 1 && mon <= 12 ? new Date(Date.UTC(year, mon, 0)).getUTCDate() : 0;
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const thaiMonthYear = useMemo(() => formatThaiMonthYear(month), [month]);
  const annualMonthOptions = useMemo(() => {
    const baseYear = Number.isFinite(year) ? year : new Date().getFullYear();
    return THAI_MONTH_SHORT.map((label, index) => {
      const monthNumber = index + 1;
      return {
        label,
        value: `${baseYear}-${String(monthNumber).padStart(2, "0")}`,
        monthNumber,
      };
    });
  }, [year]);

  const loadWards = useCallback(async () => {
    try {
      const res = await request<{ data: Ward[] }>("/wards", token);
      if (res.data && res.data.length > 0) {
        setWards(res.data);
        if (!res.data.some(w => w.id === ward)) {
          setWard(res.data[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [token, ward]);

  const accessibleWards = useMemo(() => {
    if (isAdmin) return wards;
    if (actor?.wards && actor.wards.length > 0) {
      const filtered = wards.filter(w => actor.wards!.includes(w.id));
      return filtered.length > 0 ? filtered : wards;
    }
    return wards;
  }, [wards, isAdmin, actor]);

  const shiftOptions = useMemo(() => getShiftOptions(roster?.shifts || []), [roster?.shifts]);
  const availablePaletteShifts = shiftOptions.map(shift => shift.code);

  async function signIn() {
    const candidate = tokenDraft.trim();
    if (!candidate) { setError("กรุณากรอกรหัสเข้าใช้งาน"); return; }
    setBusy(true); setError("");
    try {
      const me = await request<{ id: string; role: string; displayName?: string; wards?: string[] }>("/auth/me", candidate);
      setToken(candidate); setActor(me); setTokenDraft("");
    } catch (e) {
      setActor(null); setToken(""); setError(e instanceof Error ? e.message : "ยืนยันตัวตนไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  function signOut() {
    openWorkspace("home");
    setToken(""); setActor(null); setData(null); setWards([]); setVersions([]); setActiveCell(null);
    setShowWardModal(false); setShowDepartmentModal(false); setShowUserModal(false); setShowStaffModal(false);
    setShowHolidayModal(false); setShowLeaveModal(false); setShowPrintModal(false);
  }

  useEffect(() => {
    if (token) {
      queueMicrotask(() => { void loadWards(); });
    }
  }, [token, loadWards]);


  function focusViolation(v: Violation) {
    if (!v.date) return;
    setShowRightPanel(false);
    setActiveWorkspace("schedule");
    setActiveTab("grid");
    const key = v.subjectId ? `${v.subjectId}_${v.date}` : null;
    setFocusedCell(key);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const targets = document.querySelectorAll<HTMLElement>(key ? "[data-cell-key]" : "[data-date]");
      const target = Array.from(targets).find(el => key ? el.dataset.cellKey === key : el.dataset.date === v.date);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      target?.focus({ preventScroll: true });
    }));
  }

  function clearScheduleContext() {
    setData(null); setVersions([]); setActiveCell(null); setNotice(""); setFocusedCell(null); setLastSaved(""); setShowRightPanel(false);
  }

  async function loadScheduleById(id: number) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await request<RosterResponse>("/schedules/" + id, token);
      setData(res);
      void loadVersions(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดตารางเวรไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function loadVersions(id: number) {
    try {
      const res = await request<{ data: ScheduleSummary[] }>(`/schedules/${id}/versions`, token);
      setVersions(res.data);
    } catch {
      // ignore
    }
  }

  async function load() {
    setBusy(true);
    setError("");
    setNotice("");
    setData(null);
    setVersions([]);

    try {
      const list = await request<{ data: ScheduleSummary[] }>(`/wards/${encodeURIComponent(ward)}/schedules?month=${mon}&year=${year}`, token);
      if (!list.data.length) {
        setNotice("ยังไม่มีตารางเวรสำหรับเดือนนี้ กดปุ่ม '✨ สร้างตารางเวร' เพื่อเริ่มต้น");
        return;
      }
      setVersions(list.data);
      const published = list.data.find(s => s.status === "published");
      const targetId = published ? published.id : list.data[0].id;
      const res = await request<RosterResponse>("/schedules/" + targetId, token);
      setData(res);
      void loadVersions(targetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดตารางไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function createBlankSchedule() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await request<RosterResponse>("/schedules", token, "POST", { wardId: ward, month: mon, year });
      setData(res);
      void loadVersions(res.schedule.id);
      setNotice("สร้างตารางเวรใหม่เรียบร้อยแล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างตารางไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // Strict OT Guard (Default active to strictly prevent exceeding quota)
  const [strictOtGuard, setStrictOtGuard] = useState<boolean>(true);

  const dailyCoverage = useMemo(() => computeRosterDailyCoverage(roster, dates), [roster, dates]);

  const activeDateQuotas = useMemo(() => {
    if (!activeCell || !dailyCoverage[activeCell.cell.date]) return {};
    const dateCoverage = dailyCoverage[activeCell.cell.date];
    const map: Record<string, { actual: number; target: number }> = {};
    if (dateCoverage.morning) {
      map["ช"] = dateCoverage.morning;
      map["D"] = dateCoverage.morning;
      map["Day"] = dateCoverage.morning;
    }
    if (dateCoverage.afternoon) {
      map["บ"] = dateCoverage.afternoon;
    }
    if (dateCoverage.night) {
      map["ด"] = dateCoverage.night;
      map["N"] = dateCoverage.night;
      map["Night"] = dateCoverage.night;
    }
    if (dateCoverage.morning && dateCoverage.afternoon) {
      map["ชบ"] = {
        actual: Math.max(dateCoverage.morning.actual, dateCoverage.afternoon.actual),
        target: Math.min(dateCoverage.morning.target, dateCoverage.afternoon.target),
      };
    }
    if (dateCoverage.night && dateCoverage.afternoon) {
      map["บด"] = {
        actual: Math.max(dateCoverage.night.actual, dateCoverage.afternoon.actual),
        target: Math.min(dateCoverage.night.target, dateCoverage.afternoon.target),
      };
    }
    return map;
  }, [activeCell, dailyCoverage]);

  // Cell Edit Actions
  async function applyShiftEdit(cell: Cell, newShift: string, reason = "แก้ไขเวร") {
    if (!roster || !canEdit || editPending.current) return;
    if (cell.locked) {
      setError("เวรนี้ถูกล็อกไว้ ไม่สามารถแก้ไขได้โดยตรง");
      return;
    }

    // OT Strict Guard: strictly prevent assigning over quota
    if (newShift && newShift !== "x" && newShift !== "X" && newShift !== "อ" && newShift !== "L" && newShift !== "Va" && newShift !== "V" && newShift !== "v" && newShift !== "อบ" && newShift !== "บห" && cell.shiftCode !== newShift) {
      const dateCov = dailyCoverage[cell.date];
      let isOverQuota = false;
      let shiftLabel = "";
      let targetCount = 0;

      const wasCoveringMorning = cell.shiftCode === "ช" || cell.shiftCode === "Day" || cell.shiftCode === "D" || cell.shiftCode === "ชบ";
      const willCoverMorning = newShift === "ช" || newShift === "Day" || newShift === "D" || newShift === "ชบ";
      const isAddingToMorning = willCoverMorning && !wasCoveringMorning;

      const wasCoveringAfternoon = cell.shiftCode === "บ" || cell.shiftCode === "ชบ" || cell.shiftCode === "บด" || cell.shiftCode === "Day" || cell.shiftCode === "D";
      const willCoverAfternoon = newShift === "บ" || newShift === "ชบ" || newShift === "บด" || newShift === "Day" || newShift === "D";
      const isAddingToAfternoon = willCoverAfternoon && !wasCoveringAfternoon;

      const wasCoveringNight = cell.shiftCode === "ด" || cell.shiftCode === "บด" || cell.shiftCode === "Night" || cell.shiftCode === "N";
      const willCoverNight = newShift === "ด" || newShift === "บด" || newShift === "Night" || newShift === "N";
      const isAddingToNight = willCoverNight && !wasCoveringNight;

      if (isAddingToMorning && dateCov?.morning && dateCov.morning.target > 0 && dateCov.morning.actual >= dateCov.morning.target) {
        isOverQuota = true;
        targetCount = dateCov.morning.target;
        shiftLabel = `เวรเช้า (${dateCov.morning.actual}/${targetCount} คน)`;
      } else if (isAddingToAfternoon && dateCov?.afternoon && dateCov.afternoon.target > 0 && dateCov.afternoon.actual >= dateCov.afternoon.target) {
        isOverQuota = true;
        targetCount = dateCov.afternoon.target;
        shiftLabel = `เวรบ่าย (${dateCov.afternoon.actual}/${targetCount} คน)`;
      } else if (isAddingToNight && dateCov?.night && dateCov.night.target > 0 && dateCov.night.actual >= dateCov.night.target) {
        isOverQuota = true;
        targetCount = dateCov.night.target;
        shiftLabel = `เวรดึก (${dateCov.night.actual}/${targetCount} คน)`;
      }

      if (isOverQuota) {
        setError(`🚫 ไม่อนุญาตให้จัดเกินโควตา: วันที่ ${cell.date} ${shiftLabel} มีเจ้าหน้าที่ครบตามเป้าหมาย ${targetCount > 0 ? `(${targetCount} คน)` : ""} แล้ว เพื่อควบคุมค่า OT`);
        return;
      }
    }

    const editPayload: Edit = {
      nurseId: cell.nurseId,
      date: cell.date,
      shiftCode: newShift,
      reason,
      override: false,
      version: cell.version,
    };

    editPending.current = true;
    setSaving(true);
    setError("");
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/assignments`, token, "PUT", editPayload);
      setData(res);
      setLastSaved(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
      setActiveCell(null);
    } catch (e) {
      if (canEdit && e instanceof Error && "status" in e && (e as { status?: number }).status === 422) {
        try {
          const autoOverrideReason = "บันทึกเวรโดยผู้จัด";
          const overrideRes = await request<RosterResponse>(`/schedules/${roster.id}/assignments`, token, "PUT", { ...editPayload, reason: autoOverrideReason, override: true });
          setData(overrideRes);
          setActiveCell(null);
          setLastSaved(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
          return;
        } catch (overrideError) {
          setError(overrideError instanceof Error ? overrideError.message : "บันทึกเวรไม่สำเร็จ");
          return;
        }
      } else {
        setError(e instanceof Error ? e.message : "แก้ไขเวรไม่สำเร็จ");
      }
    } finally {
      editPending.current = false;
      setSaving(false);
    }
  }

  async function toggleCellLock(cell: Cell) {
    if (!roster || !canEdit || saving || cell.id === 0) return;
    try {
      const endpoint = cell.locked
        ? `/schedules/${roster.id}/assignments/${cell.id}/unlock`
        : `/schedules/${roster.id}/assignments/${cell.id}/lock`;
      const defaultReason = cell.locked ? "ปลดล็อกเวร" : "ล็อกเวร";
      const res = await request<RosterResponse>(endpoint, token, "PUT", { version: cell.version, reason: defaultReason });
      setData(res);
      setActiveCell(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปลี่ยนสถานะล็อกไม่สำเร็จ");
    }
  }

  // Cell Click Handler
  function handleCellClick(cell: Cell, e: React.MouseEvent) {
    if (!canEdit || busy || saving) return;
    if (brushMode) {
      void applyShiftEdit(cell, activeBrush, `แต้มเวร (${activeBrush})`);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setActiveCell({ cell, targetRect: rect });
    }
  }

  // Workflow Handlers
  async function submitReview() {
    if (!roster) return;
    setBusy(true);
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/submit-review`, token, "POST");
      setData(res);
      setNotice("ส่งตรวจตารางเวรเรียบร้อยแล้ว (สถานะ: รอตรวจ/อนุมัติ)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งตรวจไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function approveSchedule() {
    if (!roster) return;
    setBusy(true);
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/approve`, token, "POST", { note: actionText });
      setData(res);
      setActionText("");
      setNotice("อนุมัติตารางเวรเรียบร้อยแล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function reviseSchedule(reason: string) {
    if (!roster) return;
    setBusy(true);
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/revise`, token, "POST", { reason });
      setData(res);
      setActionText("");
      setNotice("ส่งกลับแก้ไขตารางเวรแล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งกลับแก้ไขไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function publishSchedule() {
    if (!roster) return;
    setBusy(true);
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/publish`, token, "POST");
      setData(res);
      setNotice("ประกาศใช้งานตารางเวรเรียบร้อยแล้ว");
      void loadVersions(roster.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ประกาศใช้งานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function unpublishSchedule(scheduleId: number, reason: string) {
    if (!reason || reason.trim().length < 5) {
      setError("กรุณาระบุเหตุผลการยกเลิกการประกาศใช้อย่างน้อย 5 ตัวอักษร");
      return;
    }
    setBusy(true);
    try {
      const res = await request<RosterResponse>(`/schedules/${scheduleId}/unpublish`, token, "POST", { reason: reason.trim() });
      setData(res);
      setShowUnpublishModal(false);
      setUnpublishReason("");
      setUnpublishTargetId(null);
      setNotice("ยกเลิกการประกาศใช้ตารางเวรเรียบร้อยแล้ว (สถานะเปลี่ยนกลับเป็นแบบร่าง)");
      void loadVersions(scheduleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ยกเลิกการประกาศใช้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraftSchedule(scheduleId: number) {
    const confirmDel = window.confirm(`คุณต้องการลบ Draft ตาราง #${scheduleId} ออกจากระบบใช่หรือไม่?`);
    if (!confirmDel) return;
    setBusy(true);
    try {
      await request(`/schedules/${scheduleId}`, token, "DELETE");
      setNotice(`ลบแบบร่างตาราง #${scheduleId} เรียบร้อยแล้ว`);
      const list = await request<{ data: ScheduleSummary[] }>(`/wards/${encodeURIComponent(ward)}/schedules?month=${mon}&year=${year}`, token);
      setVersions(list.data);
      if (roster?.id === scheduleId) {
        if (list.data.length > 0) {
          const pub = list.data.find(s => s.status === "published");
          await loadScheduleById(pub ? pub.id : list.data[0].id);
        } else {
          setData(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบแบบร่างไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function closeSchedule() {
    if (!roster) return;
    const confirmClose = window.confirm("ยืนยันการปิดงวดบัญชีตารางเวรนี้หรือไม่?\nเมื่อปิดงวดแล้ว ตารางจะถูกล็อกถาวรและไม่สามารถแก้ไขได้");
    if (!confirmClose) return;
    setBusy(true);
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/close`, token, "POST");
      setData(res);
      setNotice("ปิดงวดบัญชีตารางเวรเรียบร้อยแล้ว (สถานะ: ปิดงวดแล้ว)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ปิดงวดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function reopenSchedule(reason: string) {
    if (!roster) return;
    if (reason.trim().length < 3) {
      setError("กรุณาระบุเหตุผลการขอเปิดงวดใหม่ อย่างน้อย 3 ตัวอักษร");
      return;
    }
    setBusy(true);
    try {
      const res = await request<RosterResponse>(`/schedules/${roster.id}/reopen`, token, "POST", { reason });
      setData(res);
      setNotice("เปิดงวดตารางเวรใหม่เรียบร้อยแล้ว (สถานะ: ประกาศใช้งาน)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ขอเปิดงวดใหม่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

    async function refreshStaff() {
    if (!roster) return;
    await loadScheduleById(roster.id);
    try {
      const res = await request<{ data: Nurse[] }>(`/wards/${encodeURIComponent(ward)}/nurses`, token);
      setData((current) => current ? { ...current, schedule: { ...current.schedule, staff: res.data.map((n) => ({ id: n.id, name: n.name, position: n.position, active: n.isActive })) } } : current);
    } catch { /* roster reload is still useful */ }
  }
const currentWardObj = wards.find((w) => w.id === ward);
  const currentWardName = currentWardObj?.name || ward;
  const currentStatus = statusConfig[roster?.status ?? "draft"] ?? statusConfig.draft;
  const workflowSteps = [
    { key: "draft", label: "เตรียมข้อมูล" },
    { key: "solver", label: "จัดเวร AI" },
    { key: "generated", label: "ปรับแต่งตาราง" },
    { key: "under_review", label: "ตรวจและส่งอนุมัติ" },
    { key: "approved", label: "อนุมัติ" },
    { key: "published", label: "ประกาศ" },
  ];
  const workflowPosition = activeWorkspace === "home" ? -1 : activeWorkspace === "preflight" ? 0 : activeWorkspace === "solver" ? 1 : activeWorkspace === "review" ? 3 : activeWorkspace === "approval" ? (roster?.status === "published" ? 5 : 4) : 2;
  function openWorkspace(workspace: typeof activeWorkspace) {
    if (workspace === "solver") {
      setActiveWorkspace("home");
      setActiveTab("grid");
      setShowRightPanel(false);
      setActiveCell(null);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = document.getElementById("home-solver");
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        target?.focus({ preventScroll: true });
      }));
      return;
    }
    setActiveWorkspace(workspace);
    setActiveTab(
      workspace === "overview" ? "dashboard" :
      workspace === "proposals" ? "ai" :
      workspace === "policy" ? "policy" : "grid"
    );
    setShowRightPanel(workspace === "review");
    setActiveCell(null);
  }

  const cellMap = new Map<string, Cell>();
  if (roster) {
    for (const c of roster.assignments) {
      cellMap.set(`${c.nurseId}_${c.date}`, c);
    }
  }

  const cellViolationMap = new Map<string, Violation>();
  if (data?.report?.violations) {
    for (const v of data.report.violations) {
      if (v.subjectId && v.date) {
        cellViolationMap.set(`${v.subjectId}_${v.date}`, v);
      }
    }
  }

  const violations = data?.report?.violations || [];
  const criticalViolations = violations.filter((v) => v.severity === "error");
  const filteredViolations = violations.filter((v) => {
    const matchesSeverity = violationFilter === "all" || (violationFilter === "error" ? v.severity === "error" : v.severity !== "error");
    const haystack = `${v.ruleCode} ${v.subjectId || ""} ${v.date || ""} ${v.message}`.toLowerCase();
    return matchesSeverity && (!violationQuery.trim() || haystack.includes(violationQuery.trim().toLowerCase()));
  });
const holidaySet = new Set<string>();
  if (roster?.holidays) {
    for (const h of roster.holidays) {
      holidaySet.add(h.date.split("T")[0]);
    }
  }

  const wardPayroll = useMemo(() => {
    if (!roster) return { eveNightPay: 0, otPay: 0, totalPay: 0, otShifts: 0, otHours: 0, eveNightShifts: 0 };
    const comp = roster.policy?.compensation || {};
    const workingDays = comp.workingDays && comp.workingDays > 0 ? comp.workingDays : 22;
    const rnEveRate = comp.rnEveNightRate ?? 240;
    const pnEveRate = comp.pnEveNightRate ?? 180;
    const rawRnOtRate = comp.rnOtRate ?? 100;
    const rnOtHourlyRate = rawRnOtRate > 250 ? Math.round(rawRnOtRate / 8) : rawRnOtRate;
    const rawPnOtRate = comp.pnOtRate ?? 75;
    const pnOtHourlyRate = rawPnOtRate > 250 ? Math.round(rawPnOtRate / 8) : rawPnOtRate;

    const targetMap = new Map<string, number>();
    if (Array.isArray(roster.policy?.targets)) {
      for (const t of roster.policy.targets as Array<{ nurseId: string; hours: number }>) {
        if (t.nurseId) targetMap.set(t.nurseId, t.hours);
      }
    }

    let totalEveNightPay = 0;
    let totalOtPay = 0;
    let totalOtShifts = 0;
    let totalOtHours = 0;
    let totalEveNightShifts = 0;

    for (const nurse of roster.staff) {
      let totalHours = 0;
      let eveNight = 0;
      for (const a of roster.assignments) {
        if (a.nurseId === nurse.id) {
          const code = a.shiftCode?.trim();
          if (code === "ช" || code === "Day" || code === "D") {
            totalHours += code === "Day" || code === "D" ? 12 : 8;
          } else if (code === "บ") {
            totalHours += 8;
            eveNight += 1;
          } else if (code === "ด" || code === "Night" || code === "N") {
            totalHours += code === "Night" || code === "N" ? 12 : 8;
            eveNight += 1;
          } else if (code === "ชบ") {
            totalHours += 16;
            eveNight += 1;
          } else if (code === "บด") {
            totalHours += 16;
            eveNight += 2;
          } else if (code === "ชด") {
            totalHours += 16;
            eveNight += 1;
          } else if (code === "L" || code === "Va" || code === "V" || code === "v" || code === "อบ" || code === "บห") {
            totalHours += 8;
          }
        }
      }

      const tHours = targetMap.get(nurse.id) || (workingDays * 8);
      const otHours = Math.max(0, totalHours - tHours);
      const otShifts = otHours / 8;

      const isPN = nurse.position?.toUpperCase() === "PN";
      const eveRate = isPN ? pnEveRate : rnEveRate;
      const otHourlyRate = isPN ? pnOtHourlyRate : rnOtHourlyRate;

      totalEveNightShifts += eveNight;
      totalOtHours += otHours;
      totalOtShifts += otShifts;
      totalEveNightPay += eveNight * eveRate;
      totalOtPay += otHours * otHourlyRate;
    }

    return {
      eveNightPay: totalEveNightPay,
      otPay: totalOtPay,
      totalPay: totalEveNightPay + totalOtPay,
      otShifts: totalOtShifts,
      otHours: totalOtHours,
      eveNightShifts: totalEveNightShifts,
    };
  }, [roster]);

  const sortedStaff = useMemo(() => {
    if (!roster?.staff) return [];
    return [...roster.staff].sort((a, b) => {
      // 1. RN must always appear before PN, then other positions
      const posA = (a.position || "").toUpperCase();
      const posB = (b.position || "").toUpperCase();
      if (posA === "RN" && posB !== "RN") return -1;
      if (posA !== "RN" && posB === "RN") return 1;
      if (posA === "PN" && posB !== "PN") return -1;
      if (posA !== "PN" && posB === "PN") return 1;

      // 2. Sort by ID (numeric if possible, then alphanumeric)
      const numA = parseInt(a.id.replace(/\D/g, ""), 10);
      const numB = parseInt(b.id.replace(/\D/g, ""), 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      const idCmp = a.id.localeCompare(b.id, undefined, { numeric: true });
      if (idCmp !== 0) return idCmp;

      // 3. Fallback: Thai name collation
      return (a.name || "").localeCompare(b.name || "", "th");
    });
  }, [roster?.staff]);

  const rnCount = useMemo(() => sortedStaff.filter((s) => (s.position || "").toUpperCase() === "RN").length, [sortedStaff]);
  const pnCount = useMemo(() => sortedStaff.filter((s) => (s.position || "").toUpperCase() === "PN").length, [sortedStaff]);

  const rnStaff = useMemo(() => sortedStaff.filter((s) => (s.position || "").toUpperCase() === "RN"), [sortedStaff]);
  const pnStaff = useMemo(() => sortedStaff.filter((s) => (s.position || "").toUpperCase() === "PN"), [sortedStaff]);
  const otherStaff = useMemo(() => sortedStaff.filter((s) => !["RN", "PN"].includes((s.position || "").toUpperCase())), [sortedStaff]);

  return (
        <div className="min-h-screen bg-slate-50 font-sans">
      {!token ? (
        <LoginScreen
          onLoginSuccess={(tok, me) => {
            setToken(tok);
            setActor(me);
            setError("");
          }}
        />
      ) : (
        <>
      <div className={`nf-shell ${showPrintModal ? "print-hidden" : ""} ${showLeftPanel ? "nav-expanded" : "nav-collapsed"}`}>
        <aside className="nf-sidebar no-print" aria-label="เมนูหลัก">
          <div className="nf-brand"><Image src="/jad-easy-logo.png" alt="ระบบจัดตารางเวรพยาบาล" width={150} height={90} priority className="nf-brand-logo" /><div className="nav-label"><p>ระบบบริหารและจัดตารางเวร</p></div></div>
          <nav className="nf-menu" aria-label="พื้นที่ทำงาน">
            {[
<<<<<<< HEAD
              {label:"งานจัดตารางเวร", icon:ClipboardDocumentCheckIcon, key:"home" as const},
              {label:"ปฏิทิน 12 เดือน", icon:CalendarDaysIcon, key:"annual" as const},
=======
              {label:"ตารางเวรแต่ละเดือน", icon:ClipboardDocumentCheckIcon, key:"home" as const},
>>>>>>> Phase3_Setting
              {label:"เตรียมข้อมูล", icon:ClipboardDocumentCheckIcon, key:"preflight" as const},
              {label:"จัดตารางเวร", icon:CalendarDaysIcon, key:"schedule" as const},
              {label:"ภาพรวม", icon:ChartBarIcon, key:"overview" as const},
              {label:"อนุมัติ/ประกาศ", icon:ShieldCheckIcon, key:"approval" as const},
            ].map(item => <button key={item.key} title={item.label} type="button" aria-current={activeWorkspace === item.key ? "page" : undefined} onClick={() => openWorkspace(item.key)} className={`nf-menu-item ${activeWorkspace === item.key ? "is-active" : ""}`}><item.icon aria-hidden="true"/><span className="nav-label">{item.label}</span></button>)}
            <div className="nf-menu-divider"><span className="nav-label">จัดการข้อมูล</span></div>
            <button title="จัดการแผนกและหอผู้ป่วย" className={`nf-menu-item text-blue-700 font-medium ${activeWorkspace === "departments" ? "is-active" : ""}`} onClick={() => openWorkspace("departments")}><BuildingOffice2Icon aria-hidden="true"/><span className="nav-label">จัดการแผนก</span></button>
            {isAdmin && <button title="จัดการผู้ใช้งานระบบ" className={`nf-menu-item text-purple-700 font-medium ${activeWorkspace === "users" ? "is-active" : ""}`} onClick={() => openWorkspace("users")}><UsersIcon aria-hidden="true"/><span className="nav-label">จัดการผู้ใช้งาน</span></button>}
            <button title="จัดการเจ้าหน้าที่" className={`nf-menu-item ${activeWorkspace === "staff" ? "is-active" : ""}`} onClick={() => openWorkspace("staff")}><UsersIcon aria-hidden="true"/><span className="nav-label">เจ้าหน้าที่</span></button>
            <button title="จัดการคำขอลา" className={`nf-menu-item ${activeWorkspace === "leave" ? "is-active" : ""}`} onClick={() => openWorkspace("leave")}><CalendarIcon aria-hidden="true"/><span className="nav-label">คำขอลา</span></button>
            <button title="ปฏิทินวันหยุด" className={`nf-menu-item ${activeWorkspace === "holidays" ? "is-active" : ""}`} onClick={() => openWorkspace("holidays")}><CalendarDaysIcon aria-hidden="true"/><span className="nav-label">วันหยุด</span></button>
            <button title="เวรวันก่อนหน้า (รอยต่อเดือน)" disabled={!roster} className={`nf-menu-item ${activeWorkspace === "boundary" ? "is-active" : ""}`} onClick={() => openWorkspace("boundary")}><CalendarDaysIcon aria-hidden="true"/><span className="nav-label">เวรวันก่อนหน้า</span></button>
            <button title="นโยบายและเงื่อนไขการจัดเวร" disabled={!roster} className={`nf-menu-item ${activeWorkspace === "policy" ? "is-active" : ""}`} onClick={() => openWorkspace("policy")}><Cog6ToothIcon aria-hidden="true"/><span className="nav-label">กฎการจัดเวร</span></button>
            <button title="ตั้งค่าค่าตอบแทน & OT ประจำเดือน" disabled={!roster} className={`nf-menu-item text-emerald-700 font-medium ${activeWorkspace === "compensation" ? "is-active" : ""}`} onClick={() => openWorkspace("compensation")}><BanknotesIcon aria-hidden="true"/><span className="nav-label">ค่าตอบแทน & OT</span></button>
          </nav>
          <div className="nf-profile"><div className="nav-label"><strong>{actor?.displayName || actor?.id}</strong><p>{actor?.role === "admin" ? "👑 ผู้ดูแลระบบ (Admin)" : actor?.role === "head" ? "หัวหน้าหอผู้ป่วย (Head)" : actor?.role === "nurse" ? "พยาบาล (Nurse)" : "ผู้ดูข้อมูล (Viewer)"}</p></div><button title="ออกจากระบบ" className="nf-menu-item" onClick={signOut}><ArrowLeftOnRectangleIcon aria-hidden="true"/><span className="nav-label">ออกจากระบบ</span></button></div>
        </aside>
        <div className="nf-content">
      <header className="nf-header no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button className="nf-icon-button" onClick={() => setShowLeftPanel(!showLeftPanel)} aria-label="เปิด/ปิดเมนูหลัก" aria-expanded={showLeftPanel}><Bars3Icon/></button>
          <div><h1>{
<<<<<<< HEAD
            activeWorkspace === "home" ? "งานจัดตารางเวร" :
            activeWorkspace === "annual" ? "ปฏิทินสถานะตารางเวร 12 เดือน" :
=======
            activeWorkspace === "home" ? "ตารางเวรแต่ละเดือน" :
>>>>>>> Phase3_Setting
            activeWorkspace === "overview" ? "ภาพรวมตารางเวร" :
            activeWorkspace === "proposals" ? "ข้อเสนอการจัดเวร" :
            activeWorkspace === "approval" ? "อนุมัติและประกาศ" :
            activeWorkspace === "preflight" ? "เตรียมข้อมูล" :
            activeWorkspace === "solver" ? "จัดตารางเวรอัตโนมัติด้วย AI" :
            activeWorkspace === "policy" ? "นโยบายและเงื่อนไขการจัดเวร" :
            activeWorkspace === "staff" ? "จัดการบุคลากรประจำหอผู้ป่วย" :
            activeWorkspace === "departments" ? "บริหารจัดการแผนก / หอผู้ป่วย" :
            activeWorkspace === "holidays" ? "ปฏิทินวันหยุดนักขัตฤกษ์และประเพณี" :
            activeWorkspace === "boundary" ? "กรอกเวรวันก่อนหน้า (รอยต่อเดือน)" :
            activeWorkspace === "compensation" ? "ตั้งค่าวันทำการ & ค่าตอบแทนเวร/OT" :
            activeWorkspace === "leave" ? "จัดการคำขอลา (Leave Management)" :
            activeWorkspace === "users" ? "บริหารจัดการผู้ใช้งานระบบ (User Management)" :
            "จัดตารางเวร"
          }</h1>
          <p className="text-xs text-slate-500 font-medium">{currentWardName} · ประจำเดือน <span className="font-bold text-blue-700">{thaiMonthYear}</span></p></div>
        </div>
        <div className="nf-context-controls">
          <label>หน่วยงาน<select aria-label="หน่วยงาน" value={ward} onChange={e => {clearScheduleContext(); setWard(e.target.value);}} disabled={busy}>{accessibleWards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <button className="nf-icon-button" title="จัดการแผนกและหอผู้ป่วย" aria-label="จัดการแผนก" onClick={() => openWorkspace("departments")}><BuildingOffice2Icon className="w-4 h-4 text-blue-600"/></button>
          <label className="flex items-center gap-1.5">
            <span>เดือน</span>
            <input aria-label="เดือน" type="month" value={month} onChange={e => {clearScheduleContext(); setMonth(e.target.value);}} disabled={busy}/>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800 shadow-2xs whitespace-nowrap">
              {thaiMonthYear}
            </span>
          </label>
          <button className="nf-button" onClick={() => void load()} disabled={busy || !month}>{busy ? <ArrowPathIcon className="animate-spin"/> : <CalendarDaysIcon/>}เปิดตาราง</button>
          {roster && <span className={`nf-status ${currentStatus.bg} ${currentStatus.text}`}><span className="h-2 w-2 rounded-full bg-current"/>{currentStatus.label}<span className="font-normal">v{roster.version}</span></span>}
        </div>
      </header>
      <div className="nf-workflow-row no-print">
        <nav className="workflow-bar" aria-label="ขั้นตอนการจัดตารางเวร">
          {workflowSteps.map((step, index) => (
            <button
              type="button"
              key={step.key}
              onClick={() => openWorkspace(index === 0 ? "preflight" : index === 1 ? "solver" : index === 2 ? "schedule" : index === 3 ? "review" : "approval")}
              aria-current={index === workflowPosition ? "step" : undefined}
              className={`workflow-step ${index === workflowPosition ? "is-current" : ""}`}
            >
              <span className="workflow-step-number">{index + 1}</span>
              <span>{step.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2"><button className="nf-button nf-button-primary" disabled={!roster} onClick={() => openWorkspace("review")}><MagnifyingGlassIcon/>ตรวจสอบตาราง</button><button className="nf-button" disabled={!roster} onClick={() => setShowPrintModal(true)}><PrinterIcon/>พิมพ์ A4</button></div>
      </div>
      {/* Alerts Bar */}
      {error && (
        <div role="alert" className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5"/>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError("")} className="text-rose-500 font-bold px-1">✕</button>
        </div>
      )}
      {notice && (
        <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5"/>
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice("")} className="text-emerald-500 font-bold px-1">✕</button>
        </div>
      )}

      {roster && !isHead && <div className="mx-6 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">โหมดดูอย่างเดียว: บัญชีนี้ไม่มีสิทธิ์แก้ไขหรือนำตารางไปอนุมัติ</div>}

      <div className="nf-workspace">
        <main className="min-w-0" aria-busy={busy || saving}>
          {activeWorkspace === "annual" && (
            <div className="p-4 sm:p-6">
              <AnnualOverviewPanel
                wardId={ward}
                wardName={currentWardName}
                token={token}
                isHead={isHead}
                onOpenSchedule={async (monthStr, scheduleId) => {
                  setMonth(monthStr);
                  if (scheduleId) {
                    await loadScheduleById(scheduleId);
                  } else {
                    await load();
                  }
                  openWorkspace("schedule");
                }}
                onStartSchedule={(monthStr) => {
                  setMonth(monthStr);
                  openWorkspace("preflight");
                }}
                onPrintSchedule={async (monthStr, scheduleId) => {
                  setMonth(monthStr);
                  await loadScheduleById(scheduleId);
                  setShowPrintModal(true);
                }}
                onUnpublish={(scheduleId) => {
                  setUnpublishTargetId(scheduleId);
                  setUnpublishReason("");
                  setShowUnpublishModal(true);
                }}
              />
            </div>
          )}

          {activeWorkspace === "home" && (() => {
            const publishedSchedule = versions.find(v => v.status === "published");
            const draftCount = versions.filter(v => v.status === "draft" || v.status === "generated").length;

            return (
            <section className="space-y-5 p-4 sm:p-6" aria-labelledby="work-home-title">
              {/* 1. Official Published Schedule Spotlight Card (if currently open roster is published) */}
              {roster && roster.status === "published" && (
                <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white p-6 shadow-sm relative overflow-hidden">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-2xl shadow-md shadow-emerald-500/20 shrink-0">
                      ✓
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-emerald-950">ตารางเวรฉบับทางการ #{roster.id} (v{roster.version})</h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          📢 ประกาศใช้แล้ว
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        ประกาศโดย <strong className="text-slate-800">{roster.publishedBy || "หัวหน้าหอผู้ป่วย"}</strong> {roster.publishedAt ? `· เมื่อ ${new Date(roster.publishedAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-600 pt-1 font-medium">
                        <span>👥 บุคลากร: <strong>{roster.staff.length} คน</strong></span>
                        <span>📅 เวรทั้งหมด: <strong>{roster.assignments.length} ช่อง</strong></span>
                        <span>✓ ผลตรวจ: <strong>{criticalViolations.length === 0 ? "ผ่านข้อบังคับ 100%" : `มีข้อควรตรวจ ${criticalViolations.length} จุด`}</strong></span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 pt-4 border-t border-emerald-200/60 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="nf-button nf-button-primary bg-emerald-700 hover:bg-emerald-800 border-emerald-800" onClick={() => openWorkspace("schedule")}>
                        <CalendarDaysIcon /> ดูตารางเวรฉบับนี้
                      </button>
                      <button type="button" className="nf-button" onClick={() => setShowPrintModal(true)}>
                        <PrinterIcon /> พิมพ์ A4
                      </button>
                    </div>
                    {isHead && (
                      <button
                        type="button"
                        onClick={() => {
                          setUnpublishTargetId(roster.id);
                          setUnpublishReason("");
                          setShowUnpublishModal(true);
                        }}
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <ExclamationTriangleIcon className="w-4 h-4 text-rose-600" />
                        <span>ขอยกเลิกการประกาศใช้</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Notice if viewing a draft when another official published version exists */}
              {roster && roster.status !== "published" && publishedSchedule && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">📢</span>
                    <div>
                      <p className="text-sm font-bold text-emerald-950">มีตารางเวรฉบับทางการที่ประกาศใช้แล้ว (#{publishedSchedule.id} · v{publishedSchedule.version})</p>
                      <p className="text-xs text-emerald-700">สามารถสลับไปเปิดดูตารางฉบับทางการ หรือขอยกเลิกประกาศใช้ได้</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="nf-button bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => void loadScheduleById(publishedSchedule.id)}>
                      เปิดฉบับประกาศใช้
                    </button>
                    {isHead && (
                      <button
                        type="button"
                        onClick={() => {
                          setUnpublishTargetId(publishedSchedule.id);
                          setUnpublishReason("");
                          setShowUnpublishModal(true);
                        }}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-bold transition cursor-pointer"
                      >
                        ยกเลิกประกาศใช้
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50/40 to-white p-5 sm:p-7 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    <BuildingOffice2Icon className="w-3.5 h-3.5" />
                    {currentWardName}
                  </span>
                  {roster && (
                    <span className={`nf-status ${currentStatus.bg} ${currentStatus.text}`}>
                      <span className="h-2 w-2 rounded-full bg-current"/>
                      {currentStatus.label} v{roster.version}
                    </span>
                  )}
                </div>

                <div className="mt-3.5">
                  <div className="text-2xl sm:text-3xl font-extrabold text-blue-950 tracking-tight flex items-center gap-2.5">
                    <CalendarDaysIcon className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
                    <span>ประจำเดือน {thaiMonthYear}</span>
                  </div>
                  <h2 id="work-home-title" className="mt-1.5 text-base sm:text-lg font-bold text-slate-700">
                    {roster ? "งานที่ต้องทำต่อ" : "เริ่มจากเลือกหน่วยงานและเดือน"}
                  </h2>
                </div>

                <p className="mt-2 text-sm text-slate-600">
                  {roster
                    ? `กำลังเปิดตาราง #${roster.id} · ฉบับ v${roster.version} — สถานะ: ${currentStatus.label}`
                    : `เปิดตารางประจำเดือน ${thaiMonthYear} เพื่อค้นหางานเดิม หากยังไม่มีตาราง ให้เตรียมข้อมูลก่อนสร้างตารางใหม่`}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {!roster ? <>
                    <button className="nf-button nf-button-primary" disabled={busy || !month || !ward} onClick={() => void load()}>เปิดตารางเดือนนี้</button>
                    {isHead && <button className="nf-button" onClick={() => openWorkspace("preflight")}>เตรียมข้อมูลก่อนจัดเวร</button>}
                  </> : <>
                    <button className="nf-button nf-button-primary" disabled={busy} onClick={() => openWorkspace(!isHead || roster.status === "published" || roster.status === "closed" ? "schedule" : canEdit && !roster.assignments.length ? "solver" : criticalViolations.length ? "review" : "approval")}>
                      {!isHead ? "ดูตารางเวร" : roster.status === "published" ? "ดูตารางที่ประกาศใช้" : roster.status === "closed" ? "ดูตารางที่ปิดงวด" : canEdit && !roster.assignments.length ? "เริ่มจัดตารางเวร" : criticalViolations.length ? `ดูจุดที่ต้องแก้ไข ${criticalViolations.length} จุด` : roster.status === "under_review" ? "ตรวจเพื่ออนุมัติ" : roster.status === "approved" ? "ไปประกาศใช้ตาราง" : "ตรวจและส่งอนุมัติ"}
                    </button>
                    {canEdit && <button className="nf-button" onClick={() => openWorkspace("schedule")}>จัดตารางต่อ</button>}
                  </>}
                </div>
              </div>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="annual-month-menu-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 id="annual-month-menu-title" className="font-bold text-slate-900">ตารางเวร 12 เดือน</h3>
                    <p className="mt-1 text-xs text-slate-500">เลือกเดือนประจำปี พ.ศ. {toBuddhistYear(year)} เพื่อเปิดดูหรือจัดตารางเวร</p>
                  </div>
                  <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">กำลังเลือก {thaiMonthYear}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {annualMonthOptions.map((item) => {
                    const selected = item.value === month;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => { clearScheduleContext(); setMonth(item.value); }}
                        className={`min-h-16 rounded-xl border px-3 py-2 text-left transition ${selected ? "border-blue-500 bg-blue-50 text-blue-900 shadow-[0_0_0_1px_#3b82f6]" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/60"}`}
                      >
                        <span className="block text-xs font-bold">{String(item.monthNumber).padStart(2, "0")}</span>
                        <span className="mt-1 block text-sm font-extrabold">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="nf-button nf-button-primary" disabled={busy || !month || !ward} onClick={() => void load()}><CalendarDaysIcon/>เปิดตารางเดือนที่เลือก</button>
                  {isHead && <button className="nf-button" onClick={() => openWorkspace("preflight")}>เตรียมข้อมูลก่อนจัดเวร</button>}
                </div>
              </section>
              {roster && <div className="grid gap-4 sm:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="font-bold">ผลตรวจตารางที่เปิดอยู่</h3>
                  <p className="mt-2 font-semibold">{!data?.report ? "ยังไม่มีผลตรวจ" : criticalViolations.length ? `ต้องแก้ไข ${criticalViolations.length} จุด` : "ผ่านการตรวจข้อบังคับ"}</p>
                  {data?.report && <p className="mt-1 text-sm text-slate-600">ข้อควรตรวจสอบเพิ่มเติม {violations.length - criticalViolations.length} รายการ</p>}
                  <button className="nf-button mt-3" onClick={() => openWorkspace("review")}>ดูรายละเอียดผลตรวจ</button>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="font-bold">สถานะการนำไปใช้</h3>
                  <p className="mt-2 font-semibold">{roster.status === "published" ? "ประกาศใช้แล้ว" : roster.status === "closed" ? "ปิดงวดแล้ว" : "ยังไม่ประกาศใช้"}</p>
                  <p className="mt-1 text-sm text-slate-600">{roster.status === "published" ? "ฉบับนี้ผ่านขั้นตอนประกาศใช้งานแล้ว" : roster.status === "closed" ? "ใช้ดูข้อมูลย้อนหลังของงวดที่ปิดแล้ว" : "แม้ผ่านผลตรวจแล้ว ยังต้องอนุมัติและประกาศก่อนนำไปใช้"}</p>
                </article>
              </div>}
          {roster && canEdit && (
            <div id="home-solver" tabIndex={-1} className="scroll-mt-4 flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                    <SparklesIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">จัดเวรอัตโนมัติสำหรับฉบับที่กำลังทำ</h2>

                    </div>
                    <p className="text-xs text-slate-500">
                      ตาราง #{roster.id} · v{roster.version} — บันทึกผลลงฉบับนี้ แล้วตรวจและส่งอนุมัติก่อนประกาศใช้
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openWorkspace("schedule")}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <span>เปิดตารางเพื่อจัดเอง</span>
                </button>
              </div>

              <SolverPanel
                key={roster.id}
                wardName={currentWardName}
                roster={roster}
                token={token}
                onRosterUpdated={(res) => {
                  setData(res);
                }}
                onFixIssue={(path) => {
                  if (path.includes("roster-policy") || path.includes("targets") || path.includes("staffing")) {
                    openWorkspace("policy");
                  } else if (path.includes("boundary")) {
                    openWorkspace("boundary");
                  } else if (path.includes("staff")) {
                    openWorkspace("staff");
                  } else if (path.includes("leave")) {
                    openWorkspace("leave");
                  }
                }}
                onApplied={(res) => {
                  setData(res);
                  setNotice("บันทึกผลจัดเวรแล้ว กรุณาตรวจตารางก่อนส่งอนุมัติและประกาศใช้");
                  openWorkspace("schedule");
                }}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

              <details open className="rounded-xl border border-slate-200 bg-white p-5">
                <summary className="cursor-pointer font-bold flex items-center justify-between flex-wrap gap-2">
                  <span>ตารางแต่ละฉบับในเดือนที่เลือก ({versions.length})</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    โควตาแบบร่าง: {draftCount} / 12 Drafts
                  </span>
                </summary>
                <p className="mt-1 text-xs text-slate-500">
                  ระบบจะเรียงฉบับทางการที่ประกาศใช้ขึ้นก่อน และจำกัดจำนวน Draft ไม่เกิน 12 ฉบับ/เดือน (หากเกินจะตัด Draft เก่าออกอัตโนมัติ)
                </p>
                {!versions.length ? <p className="mt-4 text-sm text-slate-600">ยังไม่มีรายการให้แสดง กรุณาเปิดตารางเดือนนี้ก่อน หากไม่พบตาราง ให้เริ่มที่เตรียมข้อมูล</p> : <ul className="mt-4 space-y-3">
                  {versions.map(version => {
                    const isPublished = version.status === "published";
                    const isDraft = version.status === "draft" || version.status === "generated";
                    return (
                      <li key={version.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${isPublished ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center ${isPublished ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 border border-slate-200"}`}>
                            v{version.version}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900 flex items-center gap-2">
                              ตาราง #{version.id} · v{version.version}
                              {version.id === roster?.id && <span className="text-2xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">กำลังเปิดอยู่</span>}
                              {isPublished && <span className="text-2xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold">📢 ใช้งานจริง</span>}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              {statusConfig[version.status]?.label ?? version.status} · {isPublished ? "ประกาศใช้แล้ว" : version.status === "closed" ? "ข้อมูลย้อนหลัง (ปิดงวด)" : "แบบร่างยังไม่ประกาศใช้"}
                            </p>
                            <p className="mt-0.5 text-2xs text-slate-500">{version.id === roster?.id && data?.report ? criticalViolations.length ? `ผลตรวจ: ต้องแก้ไข ${criticalViolations.length} จุด` : "ผลตรวจ: ผ่านข้อบังคับ" : "เปิดฉบับนี้เพื่อดูผลตรวจ"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="nf-button" disabled={busy} onClick={() => void loadScheduleById(version.id)}>
                            {version.id === roster?.id ? "ดูรายละเอียด" : `เปิดฉบับ #${version.id}`}
                          </button>
                          {isHead && isDraft && (
                            <button
                              type="button"
                              title="ลบแบบร่างนี้"
                              disabled={busy}
                              onClick={() => void deleteDraftSchedule(version.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 hover:border-rose-300 transition cursor-pointer"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>}
              </details>
              <p className="text-sm text-slate-600">ลำดับงาน: เตรียมข้อมูล → จัดตาราง → ตรวจข้อผิดพลาด → ส่งอนุมัติ → ประกาศใช้</p>
            </section>
            );
          })()}

          {(activeWorkspace === "schedule" || activeWorkspace === "review") && roster && <div className="nf-schedule-tools">
            <div className="nf-toolbar"><div className="nf-palette" role="group" aria-label="เลือกประเภทเวร"><button type="button" className="nf-button" disabled={!canEdit} aria-pressed={brushMode} onClick={() => {setBrushMode(!brushMode); setActiveCell(null);}}> {brushMode ? "ออกจากโหมดลงหลายช่อง" : "ลงเวรหลายช่อง"}</button>{availablePaletteShifts.map((code, codeIdx) => <button key={`${code}_${codeIdx}`} type="button" disabled={!canEdit || busy || saving} title={roster.shifts.find(shift => shift.code === code)?.name || SHIFT_CONFIGS[code]?.name || code} aria-pressed={brushMode && activeBrush === code} className={`nf-shift-choice ${brushMode && activeBrush === code ? "is-selected" : ""}`} onClick={() => {setActiveBrush(code); setBrushMode(true); setActiveCell(null);}}><ShiftBadge shiftCode={code} size="sm"/><span>{roster.shifts.find(shift => shift.code === code)?.name || SHIFT_CONFIGS[code]?.name.split(" (")[0] || code}</span></button>)}
              <button disabled={!canEdit || busy || saving} className={`nf-button ${brushMode && activeBrush === "" ? "is-selected" : ""}`} aria-pressed={brushMode && activeBrush === ""} onClick={() => {setActiveBrush(""); setBrushMode(true);}}><BackspaceIcon/>ล้างเวร</button>
              {brushMode && <button className="nf-icon-button" title="หยุดแต้มเวร" aria-label="หยุดแต้มเวร" onClick={() => setBrushMode(false)}><XMarkIcon/></button>}
            </div><div className="flex flex-wrap gap-2 items-center"><details><summary className="nf-button cursor-pointer">ตัวเลือกเพิ่มเติม</summary><button type="button" onClick={() => openWorkspace("compensation")} disabled={!roster} className="nf-button text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 font-bold transition shadow-xs" title="ตั้งค่าวันทำการ & เรทค่าเวร บด / ค่า OT ประจำเดือน"><BanknotesIcon className="w-4 h-4 text-emerald-600"/><span>💰 ค่าตอบแทน & OT</span></button><button type="button" onClick={() => setStrictOtGuard(!strictOtGuard)} className={`nf-button text-xs font-bold transition ${strictOtGuard ? "bg-purple-100 text-purple-900 border-purple-300 font-black" : "text-slate-700"}`} title={strictOtGuard ? "โหมดคุม OT เข้มงวด: ห้ามจัดเวรเกินโควตาเด็ดขาด" : "โหมดเตือน OT: เตือนยืนยันก่อนจัดเกินโควตา"}><span>{strictOtGuard ? "🛡️ คุม OT: เข้มงวด" : "🛡️ คุม OT: เตือนก่อนจัดเกิน"}</span></button><button className="nf-button text-teal-700" disabled={!roster} onClick={() => openWorkspace("boundary")}><CalendarDaysIcon/>เวรวันก่อนหน้า</button></details><button className="nf-button text-blue-700 font-bold" disabled={!canEdit || busy || saving} onClick={() => openWorkspace("solver")}><SparklesIcon/>จัดเวร AI</button><button className="nf-button nf-button-warning" aria-expanded={showRightPanel} onClick={() => setShowRightPanel(true)}><ExclamationTriangleIcon/>ปัญหา {violations.length}</button></div></div>
            <div className="nf-hint"><InformationCircleIcon/>{!canEdit ? "โหมดดูอย่างเดียว — ตารางนี้ไม่อยู่ในสถานะที่แก้ไขได้ หรือบัญชีนี้ไม่มีสิทธิ์แก้ไข" : brushMode ? activeBrush ? `กำลังแต้มเวร ${roster.shifts.find(shift => shift.code === activeBrush)?.name || SHIFT_CONFIGS[activeBrush]?.name || activeBrush} — คลิกช่องวันที่เพื่อบันทึก` : "โหมดล้างเวร — คลิกช่องวันที่ที่ต้องการล้าง" : "คลิกช่องวันที่เพื่อเลือกเวร หากต้องการลงเวรต่อเนื่อง ให้เปิดโหมดลงเวรหลายช่อง"}</div>
          </div>}
          {activeWorkspace === "approval" && (
            <section className="approval-panel" aria-labelledby="approval-title">
              {!roster ? <div className="approval-empty"><h2 id="approval-title">ยังไม่มีตารางสำหรับตรวจอนุมัติ</h2><p>เปิดหรือสร้างตารางเวรก่อนเข้าสู่ขั้นตอนนี้</p></div> : <>
                <div className="approval-heading"><div><div className="context-eyebrow">ตรวจความพร้อมก่อนประกาศ</div><h2 id="approval-title">ตรวจ อนุมัติ และประกาศ</h2><p>ตรวจข้อมูลสรุปก่อนเปลี่ยนสถานะตารางเวร</p></div><span className="approval-version">v{roster.version}</span></div>
                <div className="approval-summary-grid"><div><span>หน่วยงาน</span><strong>{currentWardName}</strong></div><div><span>ประจำเดือน</span><strong className="text-blue-900 font-bold">{thaiMonthYear}</strong></div><div><span>บุคลากร</span><strong>{roster.staff.length} คน</strong></div><div><span>ปัญหา Critical</span><strong className={criticalViolations.length ? "text-rose-700" : "text-emerald-700"}>{criticalViolations.length}</strong></div></div>
                <div className="approval-checklist"><div className={criticalViolations.length === 0 ? "is-ready" : "is-blocked"}><span>{criticalViolations.length === 0 ? "✓" : "!"}</span><div><strong>ตรวจข้อบังคับ</strong><p>{criticalViolations.length === 0 ? "ไม่พบปัญหาระดับ Critical" : `ยังมี ${criticalViolations.length} ปัญหาที่ต้องแก้ก่อนส่งตรวจ`}</p></div></div><div className="is-ready"><span>✓</span><div><strong>ฉบับตาราง</strong><p>กำลังตรวจสอบฉบับ v{roster.version}</p></div></div></div>
                <div className="approval-actions">
                  {isHead && roster.status === "under_review" && (
                    <>
                      <button type="button" className="approval-secondary" onClick={() => { const reason = prompt("ระบุเหตุผลที่ส่งกลับแก้ไข:", ""); if (reason !== null) { void reviseSchedule(reason); } }} disabled={busy}>ส่งกลับแก้ไข</button>
                      <button type="button" className="approval-primary approval-green" onClick={() => void approveSchedule()} disabled={busy || criticalViolations.length > 0}>อนุมัติตาราง</button>
                    </>
                  )}
                  {isHead && roster.status === "approved" && (
                    <button type="button" className="approval-primary approval-green bg-emerald-700 hover:bg-emerald-800" onClick={() => void publishSchedule()} disabled={busy}>📢 ประกาศใช้งาน v{roster.version}</button>
                  )}
                  {isHead && roster.status === "published" && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-300 font-bold">📢 ประกาศใช้แล้ว v{roster.version}</span>
                      <button
                        type="button"
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-bold transition shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                        onClick={() => {
                          setUnpublishTargetId(roster.id);
                          setUnpublishReason("");
                          setShowUnpublishModal(true);
                        }}
                        disabled={busy}
                      >
                        <ExclamationTriangleIcon className="w-4 h-4 text-rose-600" />
                        ขอยกเลิกการประกาศใช้ (Unpublish)
                      </button>
                      <button type="button" className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-sm inline-flex items-center gap-1.5" onClick={() => void closeSchedule()} disabled={busy}>
                        <span>🔒</span> ปิดงวดบัญชี (Close)
                      </button>
                    </div>
                  )}
                  {isHead && roster.status === "closed" && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-800 bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-400 font-bold">🔒 ปิดงวดบัญชีแล้ว ({roster.closedBy || "เจ้าหน้าที่"})</span>
                      <button type="button" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-sm inline-flex items-center gap-1.5" onClick={() => { const reason = prompt("ระบุเหตุผลการขอเปิดงวดใหม่:", ""); if (reason) { void reopenSchedule(reason); } }} disabled={busy}>
                        <span>🔓</span> ขอเปิดงวดใหม่ (Reopen)
                      </button>
                    </div>
                  )}
                  {isHead && (roster.status === "draft" || roster.status === "generated") && (
                    <button type="button" className="approval-primary approval-amber" onClick={() => void submitReview()} disabled={busy || criticalViolations.length > 0}>ส่งตรวจตาราง</button>
                  )}
                  {!isHead && <p className="approval-readonly">บัญชีนี้ดูสถานะได้อย่างเดียว ไม่มีสิทธิ์อนุมัติหรือประกาศ</p>}
                </div>
              </>}
            </section>
          )}
          {activeWorkspace === "preflight" && (
            <section className="preflight-panel" aria-labelledby="preflight-title">
              <div className="preflight-heading">
                <div>
                  <div className="context-eyebrow">ขั้นตอนที่ 1</div>
                  <h2 id="preflight-title">เตรียมข้อมูลก่อนจัดเวร</h2>
                  <p>{currentWardName} · ประจำเดือน <span className="font-bold text-teal-800">{thaiMonthYear}</span></p>
                </div>
                <button type="button" className="primary-action" onClick={() => { openWorkspace("schedule"); }} disabled={!roster}>เข้าสู่ตารางเวร</button>
              </div>
              <div className="preflight-grid">
                {[
                  { label: "บุคลากร", detail: roster ? `${roster.staff.length} คนในหอผู้ป่วย` : "ยังไม่ได้เปิดตาราง", ok: Boolean(roster?.staff.length), action: () => openWorkspace("staff"), actionLabel: "จัดการบุคลากร" },
                  { label: "เวรวันก่อนหน้า", detail: roster ? `${roster.boundary?.length || 0} รายการรอยต่อเดือน` : "รอโหลดตาราง", ok: Boolean(roster), action: roster ? () => openWorkspace("boundary") : undefined, actionLabel: "กรอกเวรวันก่อนหน้า" },
                  { label: "นโยบายจัดเวร", detail: roster?.policy?.status || "ต้องตรวจสอบ policy", ok: Boolean(roster?.policy), action: roster ? () => openWorkspace("policy") : undefined, actionLabel: "ตั้งค่านโยบาย" },
                  { label: "วันลาและวันหยุด", detail: roster ? `${roster.holidays.length} วันหยุดที่โหลดแล้ว` : "รอโหลดข้อมูล", ok: Boolean(roster), action: () => openWorkspace("holidays"), actionLabel: "ปฏิทินวันหยุด" },
                  { label: "ตารางเวร", detail: roster ? `ฉบับ v${roster.version} · ${currentStatus.label}` : "ยังไม่มีฉบับตาราง", ok: Boolean(roster) },
                ].map((item) => (
                  <article key={item.label} className={`preflight-card ${item.ok ? "is-ready" : "is-pending"}`}>
                    <span className="preflight-icon">{item.ok ? "✓" : "!"}</span>
                    <div className="flex-1 min-w-0">
                      <h3>{item.label}</h3>
                      <p>{item.detail}</p>
                      {item.action && (
                        <button
                          type="button"
                          onClick={item.action}
                          className="mt-1.5 text-xs px-2.5 py-0.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg font-bold transition inline-flex items-center gap-1"
                        >
                          <span>✏️</span>
                          <span>{item.actionLabel}</span>
                        </button>
                      )}
                    </div>
                    <span className="preflight-state">{item.ok ? "พร้อม" : "ต้องตรวจ"}</span>
                  </article>
                ))}
              </div>
              <div className="preflight-tip">เคล็ดลับ: หากรายการใดไม่พร้อม ให้เปิดเมนูจัดการข้อมูลด้านซ้ายเพื่อแก้ไขก่อนเริ่มจัดเวร</div>
            </section>
          )}
          {(activeWorkspace === "schedule" || activeWorkspace === "review") && activeTab === "grid" && (
            <>
              {!roster ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-2xs space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-3xl">
                    <CalendarDaysIcon className="h-8 w-8"/>
                  </div>
                  <div className="max-w-md space-y-1">
                    <h3 className="text-base font-bold text-slate-800">ยังไม่ได้เปิดตารางเวร</h3>
                    <p className="text-xs text-slate-500">
                      เลือกหน่วยงานและเดือนที่ต้องการ หรือกดปุ่มด้านล่างเพื่อสร้างตารางเวรใหม่
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void load()}
                      disabled={busy}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                    >
                      เปิดตารางเดือนนี้
                    </button>
                    <button
                      type="button"
                      onClick={() => void createBlankSchedule()}
                      disabled={busy || !isHead}
                      className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-teal-600/20"
                    >
                      ✨ สร้างตารางเปล่าใหม่
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Schedule Month & Ward Header Banner */}
                  <div className="flex items-center justify-between flex-wrap gap-3 bg-white border border-slate-200 rounded-2xl p-3.5 sm:px-5 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 shrink-0">
                        <CalendarDaysIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">ตารางเวรประจำเดือน</div>
                        <div className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                          {thaiMonthYear}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-slate-700 font-bold bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                        {currentWardName}
                      </span>
                      <span className={`nf-status ${currentStatus.bg} ${currentStatus.text}`}>
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {currentStatus.label} v{roster.version}
                      </span>
                    </div>
                  </div>

                  {/* Hybrid View Tab Filter Bar */}
                  <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                    <div role="group" aria-label="กรองประเภทบุคลากร" className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
                      {([
                        { key: "all", label: "ทั้งหมด", count: sortedStaff.length, badge: "bg-slate-200 text-slate-800", active: "border-slate-500 bg-slate-100 text-slate-900", hover: "hover:bg-slate-50" },
                        { key: "rn", label: "พยาบาลวิชาชีพ", count: rnCount, badge: "bg-blue-100 text-blue-900", active: "border-blue-600 bg-blue-50 text-blue-950", hover: "hover:bg-blue-50" },
                        { key: "pn", label: "ผู้ช่วยพยาบาล", count: pnCount, badge: "bg-amber-100 text-amber-900", active: "border-amber-600 bg-amber-50 text-amber-950", hover: "hover:bg-amber-50" },
                      ] as const).map(item => {
                        const selected = staffViewFilter === item.key;
                        return <button key={item.key} type="button" aria-pressed={selected} onClick={() => setStaffViewFilter(item.key)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${selected ? item.active : `border-transparent text-slate-700 ${item.hover}`}`}>
                          {item.key === "all" ? <UsersIcon className="h-5 w-5 text-slate-700" aria-hidden="true" /> : <span className={`rounded-md px-2 py-1 font-bold ${item.badge}`}>{item.key.toUpperCase()}</span>}
                          <span>{item.label}</span>
                          <span className={`min-w-7 rounded-full px-2 py-0.5 text-center tabular-nums ${item.badge}`}>{item.count}</span>
                          <CheckCircleIcon className={`h-4 w-4 shrink-0 ${selected ? "" : "invisible"}`} aria-hidden="true" />
                        </button>;
                      })}
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span>มุมมองปัจจุบัน:</span>
                      <span className="font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {staffViewFilter === "all"
                          ? `แยกกลุ่ม RN (${rnCount}) & PN (${pnCount}) ทั้งหมด`
                          : staffViewFilter === "rn"
                          ? `เฉพาะพยาบาลวิชาชีพ RN (${rnCount} คน)`
                          : `เฉพาะผู้ช่วยพยาบาล PN (${pnCount} คน)`}
                      </span>
                    </div>
                  </div>

                  <div className="matrix-container" tabIndex={0} role="region" aria-label="ตารางเวร เลื่อนเพื่อดูทุกวันที่">
                    <table className="matrix-table">
                      <caption className="sr-only">ตารางเวรประจำเดือน {thaiMonthYear}</caption>
                      <thead>
                        <tr>
                          <th className="sticky-nurse-col p-2 text-left min-w-[240px] border-r border-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-slate-400 w-5 text-center">#</span>
                              <div>
                                <div className="text-xs font-bold text-slate-800">รายชื่อเจ้าหน้าที่</div>
                                <div className="text-[10px] text-slate-400 font-normal">
                                  {staffViewFilter === "all"
                                    ? `ทั้งหมด ${sortedStaff.length} คน (RN: ${rnCount}, PN: ${pnCount})`
                                    : staffViewFilter === "rn"
                                    ? `พยาบาลวิชาชีพ ${rnCount} คน`
                                    : `ผู้ช่วยพยาบาล ${pnCount} คน`}
                                </div>
                              </div>
                            </div>
                          </th>
                          {dates.map((d, i) => {
                            const dayNum = i + 1;
                            const dateObj = new Date(d);
                            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                            const isHoliday = holidaySet.has(d);
                            const dayNameThai = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][dateObj.getDay()];

                            return (
                              <th
                                key={d}
                                data-date={d}
                                tabIndex={-1}
                                className={`p-1.5 text-center min-w-[38px] border-r border-slate-200 ${
                                  isHoliday
                                    ? "bg-rose-50 text-rose-800"
                                    : isWeekend
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-slate-800"
                                }`}
                              >
                                <div className="text-[10px] text-slate-400 font-normal">{dayNameThai}</div>
                                <div className="text-xs font-bold flex items-center justify-center gap-0.5">
                                  <span>{dayNum}</span>
                                  {isHoliday && <span className="text-[9px] text-rose-500 font-bold">★</span>}
                                </div>
                              </th>
                            );
                          })}
                          <th className="p-2 text-center min-w-[280px] border-l border-slate-300 bg-slate-100">
                            <div className="text-xs font-bold text-slate-800">สรุปเวร / ค่าตอบแทน บด & OT</div>
                            <div className="text-[10px] text-slate-500 font-normal">ฐาน: {roster.policy?.compensation?.workingDays || 22} วันทำการ ({(roster.policy?.compensation?.workingDays || 22) * 8} ชม.)</div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Render Staff Rows with Section Dividers */}
                        {(() => {
                          const displayedStaff =
                            staffViewFilter === "rn"
                              ? rnStaff
                              : staffViewFilter === "pn"
                              ? pnStaff
                              : sortedStaff;

                          const renderSectionHeader = (title: string, badge: string, count: number, bgClass: string, textClass: string, borderClass: string) => (
                            <tr key={`section-${title}`} className={`border-y-2 ${borderClass} ${bgClass} font-extrabold text-xs`}>
                              <td className="sticky-nurse-col p-2 text-left">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{badge}</span>
                                  <span className={`font-black ${textClass}`}>{title}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black bg-white shadow-2xs border ${borderClass} ${textClass}`}>
                                    {count} คน
                                  </span>
                                </div>
                              </td>
                              <td colSpan={dates.length + 1} className={`p-2 text-left text-[11px] font-semibold ${textClass} opacity-85`}>
                                กลุ่ม{title} ประจำการ {count} คน (หมุนเวร 24 ชม.)
                              </td>
                            </tr>
                          );

                          const renderRow = (nurse: typeof sortedStaff[0], displayIdx: number) => (
                            <tr key={`${nurse.id || "nurse"}_${displayIdx}`} className="border-b border-slate-200 hover:bg-slate-50/70 transition">
                              {/* Sticky Nurse Info */}
                              <td className="sticky-nurse-col p-2 text-left">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-slate-400 w-5 text-center shrink-0">
                                    {displayIdx}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 text-sm font-bold rounded shrink-0 ${
                                      nurse.position.toUpperCase() === "RN" ? "bg-blue-100 text-blue-900 border border-blue-200" : nurse.position.toUpperCase() === "PN" ? "bg-amber-100 text-amber-900 border border-amber-200" : "bg-slate-100 text-slate-700 border border-slate-300"
                                    }`}
                                  >
                                    {nurse.position}
                                  </span>
                                  {nurse.partTime && (
                                    <span
                                      className="px-1.5 py-0.5 text-[10px] font-extrabold rounded shrink-0 bg-purple-100 text-purple-850 border border-purple-200"
                                      title="พยาบาลพาร์ทไทม์ / เวรเสริม"
                                    >
                                      PT
                                    </span>
                                  )}
                                  <div className="flex flex-col min-w-0 leading-tight">
                                    <div className="truncate font-bold text-slate-800 text-xs max-w-[155px]" title={nurse.name}>
                                      {nurse.name}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono font-medium">
                                      รหัส: {nurse.id}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Matrix Cells */}
                              {dates.map((d) => {
                                const cell = cellMap.get(`${nurse.id}_${d}`) ?? { id: 0, nurseId: nurse.id, date: d, shiftCode: "", version: 0, locked: false };
                                const violation = cellViolationMap.get(`${nurse.id}_${d}`);
                                const shiftCode = cell?.shiftCode || "";
                                const isLocked = cell?.locked || false;

                                return (
                                  <td
                                    key={d}
                                    className={`p-1 text-center border-r border-slate-100 ${holidaySet.has(d) || [0,6].includes(new Date(d).getDay()) ? "bg-blue-50/40" : ""}`}
                                  >
                                    <button type="button" className={`nf-cell-button ${focusedCell === `${nurse.id}_${d}` ? "is-highlighted" : ""}`} data-cell-key={`${nurse.id}_${d}`} aria-label={`${nurse.name} ${d} ${shiftCode || "ว่าง"}${isLocked ? " ล็อก" : ""}`} aria-disabled={!canEdit || busy || saving} onClick={e => cell && handleCellClick(cell,e)}>
                                    <ShiftBadge
                                      shiftCode={shiftCode}
                                      locked={isLocked}
                                      isError={violation?.severity === "error"}
                                      isWarning={violation?.severity === "warning"}
                                      size="md"
                                    />
                                    </button>
                                  </td>
                                );
                              })}

                              {/* Nurse Stats Summary Column */}
                              <NurseStatsColumn
                                nurseId={nurse.id}
                                position={nurse.position}
                                assignments={roster.assignments}
                                targetHours={(roster.policy?.targets as Array<{ nurseId: string; hours: number }> | undefined)?.find((target) => target.nurseId === nurse.id)?.hours ?? 0}
                                compensation={roster.policy?.compensation}
                                onDrilldown={() => {
                                  setDrilldownNurse(nurse);
                                  setShowDrilldownModal(true);
                                }}
                              />
                            </tr>
                          );

                          if (staffViewFilter === "all") {
                            return (
                              <>
                                {rnStaff.length > 0 && renderSectionHeader("พยาบาลวิชาชีพ", "RN", rnStaff.length, "bg-blue-50", "text-blue-900", "border-blue-300")}
                                {rnStaff.map((nurse, idx) => renderRow(nurse, idx + 1))}

                                {pnStaff.length > 0 && renderSectionHeader("ผู้ช่วยพยาบาล", "PN", pnStaff.length, "bg-amber-50", "text-amber-900", "border-amber-300")}
                                {pnStaff.map((nurse, idx) => renderRow(nurse, rnStaff.length + idx + 1))}

                                {otherStaff.length > 0 && renderSectionHeader("บุคลากรอื่นๆ", "", otherStaff.length, "bg-slate-100", "text-slate-800", "border-slate-300")}
                                {otherStaff.map((nurse, idx) => renderRow(nurse, rnStaff.length + pnStaff.length + idx + 1))}
                              </>
                            );
                          }

                          if (staffViewFilter === "rn") {
                            return (
                              <>
                                {renderSectionHeader("พยาบาลวิชาชีพ", "RN", rnStaff.length, "bg-blue-50", "text-blue-900", "border-blue-300")}
                                {rnStaff.map((nurse, idx) => renderRow(nurse, idx + 1))}
                              </>
                            );
                          }

                          if (staffViewFilter === "pn") {
                            return (
                              <>
                                {renderSectionHeader("ผู้ช่วยพยาบาล", "PN", pnStaff.length, "bg-amber-50", "text-amber-900", "border-amber-300")}
                                {pnStaff.map((nurse, idx) => renderRow(nurse, idx + 1))}
                              </>
                            );
                          }

                          return displayedStaff.map((nurse, idx) => renderRow(nurse, idx + 1));
                        })()}

                        {/* Daily Coverage Summary Row */}
                        <CoverageSummaryRow dates={dates} rosterId={roster.id} token={token} roster={roster} filterPosition={staffViewFilter} />
                      </tbody>
                    </table>
                  </div>

                  {/* Ward Grand Total Compensation Summary Card */}
                  <div className="p-4 bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-indigo-50/70 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
                        ฿
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          สรุปยอดเงินค่าตอบแทนทั้งวอร์ด (Grand Total Ward Payroll)
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            ฐาน {roster.policy?.compensation?.workingDays || 22} วันทำการ
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3 mt-1">
                          <span>ค่าเวร บด รวม: <strong className="text-slate-800">{wardPayroll.eveNightShifts}</strong> เวร (<strong className="text-emerald-700">{wardPayroll.eveNightPay.toLocaleString()}</strong> ฿)</span>
                          <span className="text-slate-300">|</span>
                          <span>ค่า OT รวม: <strong className="text-purple-700">{wardPayroll.otShifts}</strong> เวร (<strong className="text-purple-700">{wardPayroll.otPay.toLocaleString()}</strong> ฿)</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-[11px] text-slate-500">
                            (RN: บด {roster.policy?.compensation?.rnEveNightRate ?? 240}฿ / OT {(roster.policy?.compensation?.rnOtRate && roster.policy.compensation.rnOtRate <= 250) ? roster.policy.compensation.rnOtRate : (roster.policy?.compensation?.rnOtRate ? Math.round(roster.policy.compensation.rnOtRate / 8) : 100)}฿/ชม | PN: บด {roster.policy?.compensation?.pnEveNightRate ?? 180}฿ / OT {(roster.policy?.compensation?.pnOtRate && roster.policy.compensation.pnOtRate <= 250) ? roster.policy.compensation.pnOtRate : (roster.policy?.compensation?.pnOtRate ? Math.round(roster.policy.compensation.pnOtRate / 8) : 75)}฿/ชม)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">ยอดเงินรวมสุทธิทั้งวอร์ด</div>
                        <div className="text-xl font-black text-emerald-700">
                          {wardPayroll.totalPay.toLocaleString()} <span className="text-xs font-bold text-emerald-600">บาท</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openWorkspace("compensation")}
                        className="px-3 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                      >
                        <BanknotesIcon className="w-4 h-4 text-emerald-600" />
                        ตั้งค่าเงิน & วันทำการ
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {roster && <button type="button" onClick={() => setShowRightPanel(true)} className={`nf-summary-banner ${violations.length ? "has-issues" : ""}`}><ExclamationTriangleIcon/><span>{violations.length ? `พบ ${criticalViolations.length} ปัญหาสำคัญ และ ${violations.length - criticalViolations.length} ข้อควรตรวจสอบ` : "ไม่พบปัญหาจากการตรวจตารางเวร"}</span><span className="ml-auto text-blue-700">ดูรายละเอียด</span></button>}
            </>
          )}

          {activeWorkspace === "staff" && (
            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <StaffPanel
                wardId={ward}
                wardName={currentWardName}
                token={token}
                onStaffChanged={() => {
                  void load();
                }}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

          {activeWorkspace === "departments" && (
            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <DepartmentPanel
                token={token}
                wards={wards}
                currentWardId={ward}
                onRefreshWards={loadWards}
                onSelectWard={(wid) => {
                  setWard(wid);
                  clearScheduleContext();
                }}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

          {activeWorkspace === "holidays" && (
            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <HolidayPanel
                token={token}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

          {activeWorkspace === "boundary" && roster && (
            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <BoundaryPanel
                roster={roster}
                token={token}
                onSaved={(res) => {
                  setData(res);
                  setNotice("💾 บันทึกเวรวันก่อนหน้าเรียบร้อยแล้ว");
                }}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

          {activeWorkspace === "compensation" && roster && (
            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <CompensationPanel
                roster={roster}
                token={token}
                onSaved={(res) => {
                  setData(res);
                  setNotice("💾 บันทึกการตั้งค่านโยบายค่าตอบแทน & OT เรียบร้อยแล้ว");
                }}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

          {activeWorkspace === "leave" && (
            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <LeavePanel
                wardId={ward}
                wardName={currentWardName}
                nurses={(roster?.staff ?? []).map((s) => ({
                  id: s.id,
                  wardId: ward,
                  name: s.name,
                  position: s.position === "RN" || s.position === "PN" ? s.position : "RN",
                  isChargeEligible: true,
                  canDoubleShift: true,
                  isActive: s.active,
                  skills: [],
                  allowedShiftCodes: [],
                }))}
                token={token}
                onLeaveApproved={() => {
                  if (roster) void loadScheduleById(roster.id);
                }}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

          {activeWorkspace === "users" && isAdmin && (
            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <UserManagementPanel
                token={token}
                wards={wards}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

          {!roster && (activeTab === "dashboard" || activeTab === "ai" || activeTab === "solver" || activeTab === "policy" || activeWorkspace === "boundary" || activeWorkspace === "compensation") && <section className="nf-empty"><CalendarDaysIcon className="h-10 w-10 text-blue-500"/><h2>เปิดตารางเวรก่อนดูข้อมูล</h2><p>เลือกหน่วยงานและเดือน แล้วกดเปิดตาราง</p><button className="nf-button" disabled={busy} onClick={() => void load()}>เปิดตารางเดือนนี้</button></section>}
          {activeWorkspace !== "preflight" && activeWorkspace !== "approval" && activeTab === "policy" && roster && (
            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 overflow-y-auto shadow-2xs space-y-6">
              <PolicyPanel
                roster={roster}
                token={token}
                onSaved={(res) => {
                  setData(res);
                  setNotice("💾 บันทึกนโยบายและเป้าหมายชั่วโมงเรียบร้อยแล้ว");
                }}
                onBackToGrid={() => openWorkspace("schedule")}
              />
            </div>
          )}

          {activeWorkspace !== "preflight" && activeWorkspace !== "approval" && activeTab === "dashboard" && roster && (
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 overflow-y-auto shadow-2xs">
              <DashboardPanel
                scheduleId={roster.id}
                wardId={roster.wardId}
                month={roster.month}
                year={roster.year}
                version={roster.version}
                token={token}
              />
            </div>
          )}

          {activeWorkspace !== "preflight" && activeWorkspace !== "approval" && activeTab === "ai" && roster && (
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 overflow-y-auto shadow-2xs">
              <AIPanel
                canEdit={canEdit}
                roster={roster}
                token={token}
                versions={versions}
                onScheduleUpdated={(res) => setData(res)}
              />
            </div>
          )}
        </main>

        {/* RIGHT INSIGHTS PANEL */}
        {showRightPanel && roster && (
          <SidePanel title="ตรวจปัญหาตารางเวร" onClose={() => setShowRightPanel(false)}>
            {/* Workflow Action Box */}
            <div className="space-y-2 pb-3 border-b border-slate-100">
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>ขั้นตอนดำเนินงาน</span>
                <span className="text-[10px] text-slate-400 font-mono">Workflow</span>
              </div>

              {isHead && (roster.status === "draft" || roster.status === "generated") && (
                <button
                  type="button"
                  onClick={() => void submitReview()}
                  disabled={busy || criticalViolations.length > 0}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  <ClipboardDocumentCheckIcon className="h-5 w-5"/> ส่งตรวจตารางเวร
                </button>
              )}

              {isHead && roster.status === "under_review" && (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => void approveSchedule()}
                    disabled={busy || criticalViolations.length > 0}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <CheckCircleIcon className="h-5 w-5"/> อนุมัติตารางเวร
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const reason = prompt("ระบุเหตุผลที่ส่งกลับแก้ไข:", "");
                      if (reason !== null) {
                        void reviseSchedule(reason);
                      }
                    }}
                    disabled={busy}
                    className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition"
                  >
                    <ArrowPathIcon className="h-4 w-4"/> ส่งกลับแก้ไข
                  </button>
                </div>
              )}

              {isHead && roster.status === "approved" && (
                <button
                  type="button"
                  onClick={() => void publishSchedule()}
                  disabled={busy}
                  className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  <ClipboardDocumentCheckIcon className="h-5 w-5"/> ประกาศใช้งานตาราง
                </button>
              )}
            </div>

            {/* Violations & Quality Guard */}
            <div className="flex-1 space-y-2 overflow-y-auto">
                            <div className="validation-heading">
                <div><span className="text-xs font-bold text-slate-800 flex items-center gap-1"><ShieldCheckIcon className="h-5 w-5"/> ศูนย์ตรวจปัญหา</span><span className="validation-count">{criticalViolations.length} Critical · {violations.length - criticalViolations.length} Warning</span></div>
                <span className={`validation-total ${violations.length === 0 ? "is-clear" : ""}`}>{violations.length}</span>
              </div>

              {violations.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <span>💡 สรุปความหมาย:</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${criticalViolations.length > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {criticalViolations.length > 0 ? `ต้องแก้ Critical (${criticalViolations.length})` : "✅ ปลอดภัย นำไปใช้ได้"}
                    </span>
                  </div>
                  <ul className="text-[11px] text-slate-600 space-y-0.5 list-disc list-inside">
                    {criticalViolations.length > 0 ? (
                      <li className="text-rose-700 font-semibold">Critical: ต้องแก้ไขก่อนประกาศ (เช่น พักไม่พอ/คนขาด)</li>
                    ) : (
                      <li className="text-emerald-700 font-semibold">ไม่มี Critical Error (ผ่านเกณฑ์ความปลอดภัย 100%)</li>
                    )}
                    <li>Warning: เป็นข้อสังเกตเชิงคุณภาพ (เช่น เวรเสริมเพื่อเกลี่ยชั่วโมง ไม่ใช่ข้อผิดพลาด)</li>
                  </ul>
                </div>
              )}

              <div className="validation-tools">
                <input aria-label="ค้นหาปัญหา" value={violationQuery} onChange={(e) => setViolationQuery(e.target.value)} placeholder="ค้นหากฎ/พยาบาล/วันที่" />
                <div className="validation-filters" role="group" aria-label="กรองระดับปัญหา">
                  {["all", "error", "warning"].map((filter) => <button key={filter} type="button" onClick={() => setViolationFilter(filter as "all" | "error" | "warning")} className={violationFilter === filter ? "is-active" : ""}>{filter === "all" ? "ทั้งหมด" : filter === "error" ? "Critical" : "Warning"}</button>)}
                </div>
              </div>

              {violations.length === 0 ? (
                <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs text-emerald-800 text-center font-medium">
                  ไม่พบปัญหาจากกฎที่ตรวจสอบ
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredViolations.length === 0 && <p className="validation-empty">ไม่พบปัญหาที่ตรงกับตัวกรอง</p>}
                  {filteredViolations.map((v, i) => (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => focusViolation(v)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focusViolation(v); } }}
                      className={`p-2 rounded-xl border text-[11px] space-y-0.5 ${
                        v.severity === "error"
                          ? "bg-rose-50 border-rose-200 text-rose-900"
                          : "bg-amber-50 border-amber-200 text-amber-900"
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1">
                        <ExclamationTriangleIcon className="h-4 w-4"/>
                        <span>{v.ruleCode}</span>
                      </div>
                      <div className="text-[10px] opacity-80">
                        {v.date || "ทั้งเดือน"} • {v.subjectId}
                      </div>
                      <div className="text-xs leading-relaxed">{v.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Version History */}
            {versions.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                <div className="font-bold text-slate-500 text-[11px]">ประวัติเวอร์ชัน ({versions.length})</div>
                <div className="flex flex-wrap gap-1">
                  {versions.map((ver) => (
                    <button
                      key={ver.id}
                      type="button"
                      onClick={() => void loadScheduleById(ver.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        ver.id === roster.id
                          ? "bg-teal-600 text-white border-teal-600"
                          : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      v{ver.version} ({ver.status})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </SidePanel>
        )}
      </div>

        <footer className="nf-footer no-print"><span role="status">{saving ? "กำลังบันทึก… " : lastSaved ? `บันทึกแล้ว ${lastSaved} · ` : ""}{roster ? `ตารางประจำเดือน ${thaiMonthYear} · เจ้าหน้าที่ ${roster.staff.length} คน · ฉบับ v${roster.version}` : "เลือกหน่วยงานและเดือนเพื่อเริ่มต้น"}</span><span>ระบบจัดตารางเวรพยาบาล</span></footer>
        </div>
      </div>
      {/* QUICK FLOATING SHIFT PICKER */}
      {activeCell && canEdit && (
        <QuickShiftPicker
          nurseName={roster?.staff.find(n => n.id === activeCell.cell.nurseId)?.name}
          shiftOptions={shiftOptions}
          currentShift={activeCell.cell.shiftCode}
          isLocked={activeCell.cell.locked}
          position={{
            top: activeCell.targetRect.bottom + 6,
            left: activeCell.targetRect.left - 40,
          }}
          date={activeCell.cell.date}
          shiftQuotas={activeDateQuotas}
          onSelectShift={(shiftCode) => void applyShiftEdit(activeCell.cell, shiftCode)}
          canLock={activeCell.cell.id > 0}
          shiftCodes={availablePaletteShifts}
          onToggleLock={() => void toggleCellLock(activeCell.cell)}
          onClose={() => setActiveCell(null)}
        />
      )}

      {/* PRINT & DRILLDOWN MODALS */}
      {roster && (
        <>
          <OfficialRosterPrint
            open={showPrintModal}
            onClose={() => setShowPrintModal(false)}
            roster={roster}
            wardName={currentWardName}
          />

          {showDrilldownModal && drilldownNurse && (
            <PayrollDrilldownModal
              roster={roster}
              nurse={drilldownNurse}
              isOpen={showDrilldownModal}
              onClose={() => {
                setShowDrilldownModal(false);
                setDrilldownNurse(null);
              }}
            />
          )}
        </>
      )}

      {/* UNPUBLISH MODAL */}
      {showUnpublishModal && unpublishTargetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in" onClick={() => !busy && setShowUnpublishModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl border border-rose-200 max-w-lg w-full p-6 sm:p-7 space-y-5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                ⚠️
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900">ขอยกเลิกการประกาศใช้ตารางเวร</h3>
                <p className="text-xs text-slate-500">ตารางฉบับ #{unpublishTargetId} จะถูกสลับสถานะกลับเป็น <strong>แบบร่าง (Draft)</strong> เพื่อให้แก้ไขหรือคำนวณเวรใหม่ได้</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1 leading-relaxed">
              <p className="font-bold flex items-center gap-1.5 text-amber-950">
                <span>📌</span> เงื่อนไขการยกเลิก:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800 text-[11px]">
                <li>ระบบจะบันทึกชื่อผู้ยกเลิก เวลา และเหตุผลลงใน <strong>ประวัติการตรวจสอบ (Audit Log)</strong></li>
                <li>กรุณาระบุเหตุผลที่ชัดเจน (อย่างน้อย 5 ตัวอักษร)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label htmlFor="unpublish-reason" className="block text-xs font-bold text-slate-700">
                ระบุเหตุผลการยกเลิกประกาศใช้ <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="unpublish-reason"
                rows={3}
                value={unpublishReason}
                onChange={(e) => setUnpublishReason(e.target.value)}
                placeholder="เช่น มีพยาบาลลาคลอดกะทันหัน / ต้องการปรับอัตรากำลังเวรดึก..."
                disabled={busy}
                className="w-full rounded-2xl border border-slate-300 p-3.5 text-xs text-slate-800 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 focus:outline-none transition resize-none placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>ความยาวขั้นต่ำ 5 ตัวอักษร</span>
                <span className={unpublishReason.trim().length >= 5 ? "text-emerald-600 font-bold" : "text-slate-400"}>
                  {unpublishReason.trim().length} / 5 ตัวอักษร
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                className="nf-button"
                onClick={() => {
                  setShowUnpublishModal(false);
                  setUnpublishReason("");
                  setUnpublishTargetId(null);
                }}
                disabled={busy}
              >
                ปิด / ยกเลิก
              </button>
              <button
                type="button"
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                disabled={busy || unpublishReason.trim().length < 5}
                onClick={() => {
                  if (unpublishTargetId !== null) {
                    void unpublishSchedule(unpublishTargetId, unpublishReason);
                  }
                }}
              >
                {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ExclamationTriangleIcon className="w-4 h-4" />}
                <span>ยืนยันยกเลิกประกาศใช้</span>
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

