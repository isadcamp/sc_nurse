"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { request } from "@/lib/api";
import type { LeaveRequestData, Nurse } from "@/types/schedule";
import {
  CalendarDaysIcon,
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ArrowLeftIcon,
  CheckBadgeIcon,
  UserGroupIcon,
  ArrowUturnLeftIcon,
  DocumentChartBarIcon,
  FunnelIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

interface LeavePanelProps {
  wardId: string;
  wardName: string;
  nurses: Nurse[];
  token: string;
  onLeaveApproved?: () => void;
  onBackToGrid?: () => void;
}

const PAGE_SIZE = 15;

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

function formatThaiDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const thaiYear = y > 2400 ? y : y + 543;
    const monthName = THAI_MONTHS_SHORT[m - 1] || `${m}`;
    return `${d} ${monthName} ${thaiYear}`;
  } catch {
    return dateStr;
  }
}

function formatThaiDateRange(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "-";
  const startFmt = formatThaiDate(startDate);
  if (startDate === endDate) {
    return startFmt;
  }
  const endFmt = formatThaiDate(endDate);
  return `${startFmt} ถึง ${endFmt}`;
}

export function LeavePanel({
  wardId,
  wardName,
  nurses,
  token,
  onLeaveApproved,
  onBackToGrid,
}: LeavePanelProps) {
  const [tab, setTab] = useState<"list" | "create" | "report">("list");
  const [viewScope, setViewScope] = useState<"actionable" | "current_month" | "all">("actionable");
  const [requests, setRequests] = useState<LeaveRequestData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  // Search, Filter & Pagination states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selectedNurseFilter, setSelectedNurseFilter] = useState<string>("all");
  const [selectedYearFilter, setSelectedYearFilter] = useState<number>(new Date().getFullYear());
  const [currentPage, setCurrentPage] = useState(1);

  // Form states
  const [selectedNurseId, setSelectedNurseId] = useState("");
  const [leaveType, setLeaveType] = useState("ลาพักผ่อน");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchLeaveRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await request<{ data: LeaveRequestData[] }>(`/leave-requests?ward=${wardId}`, token);
      setRequests(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลคำขอลาได้");
    } finally {
      setLoading(false);
    }
  }, [wardId, token]);

  useEffect(() => {
    void fetchLeaveRequests();
    if (nurses.length > 0 && !selectedNurseId) {
      setSelectedNurseId(nurses[0].id);
    }
    setTab("list");
    setCurrentPage(1);
    setSearchQuery("");
    setError("");
    setSuccess("");
  }, [fetchLeaveRequests, nurses, selectedNurseId]);

  async function handleCreateLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNurseId || !startDate || !endDate) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const nurse = nurses.find((n) => n.id === selectedNurseId);
      await request("/leave-requests", token, "POST", {
        wardId,
        nurseId: selectedNurseId,
        nurseName: nurse?.name ?? selectedNurseId,
        startDate,
        endDate,
        leaveType,
        reason: reason.trim(),
      });
      setSuccess("ยื่นคำขอลาเรียบร้อยแล้ว");
      setStartDate("");
      setEndDate("");
      setReason("");
      setTab("list");
      await fetchLeaveRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยื่นคำขอลาไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: number) {
    setActionId(id);
    setError("");
    setSuccess("");
    try {
      await request(`/leave-requests/${id}/approve`, token, "PUT");
      setSuccess("อนุมัติคำขอลาและบันทึกลงตารางเวรเรียบร้อยแล้ว");
      await fetchLeaveRequests();
      if (onLeaveApproved) {
        onLeaveApproved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(id: number) {
    const rejectReason = prompt("กรุณาระบุเหตุผลในการปฏิเสธ (ถ้ามี):", "");
    if (rejectReason === null) return;

    setActionId(id);
    setError("");
    setSuccess("");
    try {
      await request(`/leave-requests/${id}/reject`, token, "PUT", { reason: rejectReason });
      setSuccess("ปฏิเสธคำขอลาเรียบร้อยแล้ว");
      await fetchLeaveRequests();
      if (onLeaveApproved) {
        onLeaveApproved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setActionId(null);
    }
  }

  // Cancel / Revoke an already Approved Leave Request
  async function handleCancelApproval(id: number, nurseName: string, dateRange: string) {
    const cancelReason = prompt(
      `คุณต้องการยกเลิกการอนุมัติคำขอลาของ "${nurseName}" (${dateRange})\nกรุณาระบุเหตุผลในการยกเลิก (จำเป็น):`,
      ""
    );
    if (cancelReason === null) return;
    if (!cancelReason.trim()) {
      alert("กรุณาระบุเหตุผลในการยกเลิกการอนุมัติ");
      return;
    }

    setActionId(id);
    setError("");
    setSuccess("");
    try {
      await request(`/leave-requests/${id}/reject`, token, "PUT", {
        reason: `[ยกเลิกการอนุมัติ] ${cancelReason.trim()}`,
      });
      setSuccess(`ยกเลิกการอนุมัติคำขอลาของ ${nurseName} และปลดล็อกเวร L ในตารางเวรเรียบร้อยแล้ว`);
      await fetchLeaveRequests();
      if (onLeaveApproved) {
        onLeaveApproved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยกเลิกการอนุมัติไม่สำเร็จ");
    } finally {
      setActionId(null);
    }
  }

  const getNurseName = (nurseId: string, nurseName?: string) => {
    if (nurseName) return nurseName;
    const n = nurses.find((x) => x.id === nurseId);
    return n ? n.name : nurseId;
  };

  const currentMonthPrefix = useMemo(() => new Date().toISOString().slice(0, 7), []);

  // Filtered requests according to Scope (Actionable vs Current Month vs All) + Filters
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Scope filtering
      if (viewScope === "actionable") {
        // Pending first, or approved/rejected within current month or upcoming
        const isPending = req.status === "pending";
        const isRecent = req.startDate >= currentMonthPrefix || req.endDate >= currentMonthPrefix;
        if (!isPending && !isRecent) return false;
      } else if (viewScope === "current_month") {
        const isInMonth = req.startDate.startsWith(currentMonthPrefix) || req.endDate.startsWith(currentMonthPrefix);
        if (!isInMonth) return false;
      }

      // Nurse Filter
      if (selectedNurseFilter !== "all" && req.nurseId !== selectedNurseFilter) {
        return false;
      }

      // Search Query
      const name = getNurseName(req.nurseId, req.nurseName).toLowerCase();
      const id = req.nurseId.toLowerCase();
      const rReason = (req.reason || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchQuery = name.includes(query) || id.includes(query) || rReason.includes(query);

      // Status Filter
      const matchStatus = statusFilter === "all" || req.status === statusFilter;

      return matchQuery && matchStatus;
    });
  }, [requests, viewScope, selectedNurseFilter, searchQuery, statusFilter, currentMonthPrefix, nurses]);

  // Pagination calculation with 15 rows per page
  const totalItems = filteredRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * PAGE_SIZE;
  const paginatedRequests = filteredRequests.slice(startIndex, startIndex + PAGE_SIZE);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  // Leave Summary Statistics Report per Nurse
  const leaveSummaryReport = useMemo(() => {
    const map: Record<
      string,
      {
        nurseId: string;
        nurseName: string;
        position: string;
        vacationDays: number;
        personalDays: number;
        sickDays: number;
        otherDays: number;
        totalApprovedDays: number;
        pendingDays: number;
      }
    > = {};

    nurses.forEach((n) => {
      map[n.id] = {
        nurseId: n.id,
        nurseName: n.name,
        position: n.position || "RN",
        vacationDays: 0,
        personalDays: 0,
        sickDays: 0,
        otherDays: 0,
        totalApprovedDays: 0,
        pendingDays: 0,
      };
    });

    requests.forEach((req) => {
      const yearStr = req.startDate.slice(0, 4);
      if (Number(yearStr) !== selectedYearFilter) return;

      const d1 = new Date(req.startDate);
      const d2 = new Date(req.endDate);
      const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);

      if (!map[req.nurseId]) {
        map[req.nurseId] = {
          nurseId: req.nurseId,
          nurseName: getNurseName(req.nurseId, req.nurseName),
          position: "RN",
          vacationDays: 0,
          personalDays: 0,
          sickDays: 0,
          otherDays: 0,
          totalApprovedDays: 0,
          pendingDays: 0,
        };
      }

      const item = map[req.nurseId];
      if (req.status === "approved") {
        item.totalApprovedDays += days;
        const type = req.leaveType || (req.reason?.includes("[") ? req.reason.split("]")[0].replace("[", "") : "ลาพักผ่อน");
        if (type.includes("พักผ่อน") || type.includes("พักร้อน") || type.includes("Vacation")) {
          item.vacationDays += days;
        } else if (type.includes("กิจ") || type.includes("Personal")) {
          item.personalDays += days;
        } else if (type.includes("ป่วย") || type.includes("Sick")) {
          item.sickDays += days;
        } else {
          item.otherDays += days;
        }
      } else if (req.status === "pending") {
        item.pendingDays += days;
      }
    });

    return Object.values(map);
  }, [requests, nurses, selectedYearFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner / Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBackToGrid && (
            <button
              type="button"
              onClick={onBackToGrid}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span>← กลับสู่ตารางเวร</span>
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
            <CalendarDaysIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              จัดการคำขอลา (Leave Management)
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                {wardName || wardId}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              ยื่นคำขอลา อนุมัติ ยกเลิกการอนุมัติ และรายงานสรุปวันลาสะสมประจำปี
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tab !== "create" && (
            <button
              type="button"
              onClick={() => {
                setTab("create");
                setError("");
                setSuccess("");
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              <span>ยื่นคำขอลาใหม่</span>
            </button>
          )}

          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTab("list")}
              className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                tab === "list" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FunnelIcon className="w-3.5 h-3.5" />
              <span>รายการคำขอลา</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("report")}
              className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                tab === "report" ? "bg-white text-purple-900 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <DocumentChartBarIcon className="w-3.5 h-3.5 text-purple-600" />
              <span>รายงานวันลาย้อนหลัง</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void fetchLeaveRequests()}
            disabled={loading}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition"
            title="รีเฟรชข้อมูล"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-black">
            <UserGroupIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-semibold">คำขอลาทั้งหมด</div>
            <div className="text-xl font-black text-slate-800">{requests.length} รายการ</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
            <ClockIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-amber-700 font-semibold">รออนุมัติ (ต้องดำเนินการ)</div>
            <div className="text-xl font-black text-amber-900 flex items-center gap-2">
              <span>{pendingCount}</span>
              {pendingCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold animate-pulse">
                  รอดำเนินการ
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
            <CheckCircleIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-emerald-700 font-semibold">อนุมัติแล้ว (ลงเวร L)</div>
            <div className="text-xl font-black text-emerald-900">{approvedCount} รายการ</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-black">
            <XCircleIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-rose-700 font-semibold">ปฏิเสธ / ยกเลิกแล้ว</div>
            <div className="text-xl font-black text-rose-900">{rejectedCount} รายการ</div>
          </div>
        </div>
      </div>

      {/* Notice & Error */}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckBadgeIcon className="w-5 h-5 text-emerald-600" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess("")} className="text-emerald-600 hover:text-emerald-900 font-bold px-1">✕</button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircleIcon className="w-5 h-5 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900 font-bold px-1">✕</button>
        </div>
      )}

      {/* VIEW: 1. LIST OF REQUESTS */}
      {tab === "list" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          {/* Smart Scope Selector Tabs */}
          <div className="px-5 pt-4 pb-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4 text-blue-600" />
                <span>มุมมองข้อมูล:</span>
              </span>
              <div className="inline-flex rounded-xl bg-white p-0.5 border border-slate-200 text-xs font-bold shadow-2xs">
                <button
                  type="button"
                  onClick={() => { setViewScope("actionable"); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    viewScope === "actionable"
                      ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ⚡ ต้องดำเนินการ ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => { setViewScope("current_month"); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    viewScope === "current_month"
                      ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📅 เดือนปัจจุบัน ({currentMonthPrefix})
                </button>
                <button
                  type="button"
                  onClick={() => { setViewScope("all"); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    viewScope === "all"
                      ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📜 รายการทั้งหมด ({requests.length})
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              แสดง 15 รายการต่อหน้า • ข้อมูลอัปเดตแบบเรียลไทม์
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-4 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
              <div className="relative w-full">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อเจ้าหน้าที่, รหัส หรือเหตุผล..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500">พยาบาล:</span>
                <select
                  value={selectedNurseFilter}
                  onChange={(e) => { setSelectedNurseFilter(e.target.value); setCurrentPage(1); }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">ทั้งหมด (All Staff)</option>
                  {nurses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.position || "RN"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500">สถานะ:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setCurrentPage(1); }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รออนุมัติ (Pending)</option>
                  <option value="approved">อนุมัติแล้ว (Approved)</option>
                  <option value="rejected">ปฏิเสธ / ยกเลิก (Rejected)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table with Sequence Number (ลำดับ) as Column 1 */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 text-center w-14">ลำดับ</th>
                  <th className="py-3 px-4">เจ้าหน้าที่</th>
                  <th className="py-3 px-4">ประเภทการลา</th>
                  <th className="py-3 px-4">ช่วงวันที่ลา</th>
                  <th className="py-3 px-4">เหตุผล</th>
                  <th className="py-3 px-4 text-center">สถานะ</th>
                  <th className="py-3 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {paginatedRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <CalendarDaysIcon className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold">ไม่พบรายการคำขอลาตามเงื่อนไขที่เลือก</p>
                    </td>
                  </tr>
                ) : (
                  paginatedRequests.map((req, idx) => {
                    const nurseName = getNurseName(req.nurseId, req.nurseName);
                    const seqNumber = startIndex + idx + 1;
                    return (
                      <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Column 1: Sequence Number */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-400">
                          {seqNumber}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{nurseName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">รหัส: {req.nurseId}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-bold">
                            {req.leaveType || "ลาพักผ่อน"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <CalendarDaysIcon className="w-4 h-4 text-blue-500 shrink-0" />
                            <span>{formatThaiDateRange(req.startDate, req.endDate)}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono pl-5.5">
                            {req.startDate === req.endDate ? "(1 วัน)" : `(${Math.max(1, Math.round((new Date(req.endDate).getTime() - new Date(req.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1)} วัน)`}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={req.reason}>
                          {req.reason || "-"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {req.status === "pending" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[11px]">
                              <ClockIcon className="w-3 h-3" /> รออนุมัติ
                            </span>
                          )}
                          {req.status === "approved" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                              <CheckCircleIcon className="w-3 h-3" /> อนุมัติแล้ว
                            </span>
                          )}
                          {req.status === "rejected" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">
                              <XCircleIcon className="w-3 h-3" /> ปฏิเสธ/ยกเลิก
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {req.status === "pending" && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={actionId === req.id}
                                onClick={() => handleApprove(req.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1 shadow-2xs transition disabled:opacity-50"
                              >
                                {actionId === req.id ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckCircleIcon className="w-3.5 h-3.5" />}
                                <span>อนุมัติ</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionId === req.id}
                                onClick={() => handleReject(req.id)}
                                className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold flex items-center gap-1 transition disabled:opacity-50"
                              >
                                <XCircleIcon className="w-3.5 h-3.5" />
                                <span>ปฏิเสธ</span>
                              </button>
                            </div>
                          )}

                          {req.status === "approved" && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={actionId === req.id}
                                onClick={() => handleCancelApproval(req.id, nurseName, `${req.startDate} ถึง ${req.endDate}`)}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-bold flex items-center gap-1 transition shadow-2xs disabled:opacity-50"
                                title="ยกเลิกการอนุมัติและปลดล็อกเวร L ออกจากตารางเวร"
                              >
                                {actionId === req.id ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <ArrowUturnLeftIcon className="w-3.5 h-3.5" />}
                                <span>ยกเลิกอนุมัติ</span>
                              </button>
                            </div>
                          )}

                          {req.status === "rejected" && (
                            <span className="text-[11px] text-slate-400">ดำเนินการแล้ว</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls - 15 items per page */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
              <div>
                แสดง {startIndex + 1} - {Math.min(startIndex + PAGE_SIZE, totalItems)} จาก {totalItems} รายการ (15 รายการ/หน้า)
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={validCurrentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 font-bold text-slate-800">
                  หน้า {validCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={validCurrentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: 2. ANNUAL LEAVE SUMMARY REPORT */}
      {tab === "report" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <DocumentChartBarIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  รายงานสรุปวันลาย้อนหลังและสะสมรายปี (Leave Summary Report)
                </h3>
                <p className="text-xs text-slate-500">
                  สรุปสถิติจำนวนวันลาที่อนุมัติแล้วแยกตามประเภทการลาของบุคลากรประจำหอผู้ป่วย
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">ประจำปี:</span>
              <select
                value={selectedYearFilter}
                onChange={(e) => setSelectedYearFilter(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
              >
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>
                    พ.ศ. {y + 543} ({y})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px] uppercase">
                  <th className="py-3 px-4 text-center w-14">ลำดับ</th>
                  <th className="py-3 px-4">เจ้าหน้าที่</th>
                  <th className="py-3 px-4 text-center">ตำแหน่ง</th>
                  <th className="py-3 px-4 text-center">ลาพักผ่อน/พักร้อน</th>
                  <th className="py-3 px-4 text-center">ลากิจ</th>
                  <th className="py-3 px-4 text-center">ลาป่วย</th>
                  <th className="py-3 px-4 text-center">ลาอื่นๆ</th>
                  <th className="py-3 px-4 text-center">รวมวันลาที่อนุมัติ</th>
                  <th className="py-3 px-4 text-center">รออนุมัติ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {leaveSummaryReport.map((row, idx) => (
                  <tr key={row.nurseId} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{row.nurseName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">รหัส: {row.nurseId}</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        row.position === "RN" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}>
                        {row.position}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-purple-700">
                      {row.vacationDays > 0 ? `${row.vacationDays} วัน` : "-"}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-blue-700">
                      {row.personalDays > 0 ? `${row.personalDays} วัน` : "-"}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-rose-700">
                      {row.sickDays > 0 ? `${row.sickDays} วัน` : "-"}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-600">
                      {row.otherDays > 0 ? `${row.otherDays} วัน` : "-"}
                    </td>
                    <td className="py-3 px-4 text-center font-black text-emerald-800 bg-emerald-50/30">
                      {row.totalApprovedDays > 0 ? `${row.totalApprovedDays} วัน` : "0 วัน"}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-amber-700">
                      {row.pendingDays > 0 ? `${row.pendingDays} วัน` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: 3. CREATE LEAVE REQUEST FORM */}
      {tab === "create" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PlusIcon className="w-5 h-5 text-blue-600" />
              <span>ยื่นคำขอลาใหม่</span>
            </h3>
            <button
              type="button"
              onClick={() => setTab("list")}
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              ← กลับไปหน้ารายการ
            </button>
          </div>

          <form onSubmit={handleCreateLeave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                เลือกเจ้าหน้าที่ <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedNurseId}
                onChange={(e) => setSelectedNurseId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {nurses.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.position}) - {n.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ประเภทการลา <span className="text-rose-500">*</span>
              </label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="ลาพักผ่อน">ลาพักผ่อน (Vacation Leave)</option>
                <option value="ลากิจ">ลากิจ (Personal Leave)</option>
                <option value="ลาป่วย">ลาป่วย (Sick Leave)</option>
                <option value="ลาคลอด">ลาคลอด (Maternity Leave)</option>
                <option value="ลาศึกษาต่อ/อบรม">ลาศึกษาต่อ/อบรม (Training/Study Leave)</option>
                <option value="อื่นๆ">อื่นๆ (Other)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ตั้งแต่วันที่ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ถึงวันที่ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                เหตุผลหรือรายละเอียดเพิ่มเติม
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="ระบุเหตุผลในการขอลา (ถ้ามี)"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition disabled:opacity-50"
              >
                {submitting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PlusIcon className="w-4 h-4" />}
                <span>บันทึกและส่งคำขอ</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("list")}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
