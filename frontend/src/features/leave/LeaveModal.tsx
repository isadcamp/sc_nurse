"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { request } from "@/lib/api";
import type { LeaveRequestData, Nurse } from "@/types/schedule";
import {
  CalendarDaysIcon,
  XMarkIcon,
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

interface LeaveModalProps {
  open: boolean;
  onClose: () => void;
  wardId: string;
  nurses: Nurse[];
  token: string;
  onLeaveApproved?: () => void;
}

const PAGE_SIZE = 10;

export function LeaveModal({
  open,
  onClose,
  wardId,
  nurses,
  token,
  onLeaveApproved,
}: LeaveModalProps) {
  const [tab, setTab] = useState<"list" | "create">("list");
  const [requests, setRequests] = useState<LeaveRequestData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  // Search, Filter & Pagination states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
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
    if (open) {
      queueMicrotask(() => { void fetchLeaveRequests(); });
      if (nurses.length > 0 && !selectedNurseId) {
        queueMicrotask(() => setSelectedNurseId(nurses[0].id));
      }
      setTab("list");
      setCurrentPage(1);
      setSearchQuery("");
      setError("");
      setSuccess("");
    }
  }, [open, fetchLeaveRequests, nurses, selectedNurseId]);

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
      setSuccess("อนุมัติคำขอลาและลงเวร L ในตารางเวรเรียบร้อยแล้ว");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setActionId(null);
    }
  }

  const getNurseName = (nurseId: string, nurseName?: string) => {
    if (nurseName) return nurseName;
    const n = nurses.find((x) => x.id === nurseId);
    return n ? n.name : nurseId;
  };

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const name = getNurseName(req.nurseId, req.nurseName).toLowerCase();
      const id = req.nurseId.toLowerCase();
      const rReason = (req.reason || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchQuery = name.includes(query) || id.includes(query) || rReason.includes(query);
      const matchStatus = statusFilter === "all" || req.status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [requests, searchQuery, statusFilter, nurses]);

  // Pagination calculation
  const totalItems = filteredRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * PAGE_SIZE;
  const paginatedRequests = filteredRequests.slice(startIndex, startIndex + PAGE_SIZE);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  if (!open) return null;

  return (
    <ModalFrame title="จัดการคำขอลา" onClose={onClose}>
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-[92vw] md:w-[66.67vw] max-w-6xl h-[75vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <CalendarDaysIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                ระบบจัดการการลา (Leave Management) — แผนก: {wardId}
              </h3>
              <p className="text-xs text-slate-400">
                ยื่นคำขอลา อนุมัติ และซิงค์ลงเวร L ในตารางเวรอัตโนมัติ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tab === "list" ? (
              <button
                type="button"
                onClick={() => {
                  setTab("create");
                  setError("");
                  setSuccess("");
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
              >
                <PlusIcon className="w-4 h-4" />
                <span>ยื่นคำขอลาใหม่</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTab("list");
                  setError("");
                  setSuccess("");
                }}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
              >
                ← กลับไปหน้ารายการ
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notice & Error */}
        {success && (
          <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center justify-between shrink-0">
            <span>✅ {success}</span>
            <button onClick={() => setSuccess("")} className="text-emerald-600 hover:text-emerald-900 font-bold px-1">✕</button>
          </div>
        )}
        {error && (
          <div className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-xs font-semibold text-rose-800 flex items-center justify-between shrink-0">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900 font-bold px-1">✕</button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/60 flex flex-col">
          {tab === "list" ? (
            <div className="space-y-4 h-full flex flex-col">
              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="relative w-full sm:w-80">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อเจ้าหน้าที่, รหัส, เหตุผล..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">สถานะ:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as "all" | "pending" | "approved" | "rejected");
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  >
                    <option value="all">ทั้งหมด (All Status)</option>
                    <option value="pending">รออนุมัติ ({pendingCount})</option>
                    <option value="approved">อนุมัติแล้ว (Approved)</option>
                    <option value="rejected">ปฏิเสธ (Rejected)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void fetchLeaveRequests()}
                    className="p-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition shadow-xs"
                    title="โหลดข้อมูลใหม่"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex-1 flex flex-col">
                <div className="overflow-y-auto max-h-[48vh] flex-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-3 px-4 w-16 text-center">ลำดับ</th>
                        <th className="py-3 px-4">ชื่อเจ้าหน้าที่ / รหัส</th>
                        <th className="py-3 px-4 w-44">ช่วงวันที่ลา</th>
                        <th className="py-3 px-4">เหตุผลการลา</th>
                        <th className="py-3 px-4 w-32 text-center">สถานะ</th>
                        <th className="py-3 px-4 w-40 text-right">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            กำลังโหลดข้อมูลคำขอลา...
                          </td>
                        </tr>
                      ) : paginatedRequests.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            ไม่พบรายการคำขอลา
                          </td>
                        </tr>
                      ) : (
                        paginatedRequests.map((req, index) => {
                          const serialNumber = startIndex + index + 1;
                          const isPending = req.status === "pending";
                          const isApproved = req.status === "approved";
                          return (
                            <tr key={req.id} className="hover:bg-slate-50 transition">
                              {/* ลำดับ (Sequential Index) */}
                              <td className="py-3 px-4 text-center font-bold text-slate-500">
                                {serialNumber}
                              </td>

                              {/* ชื่อเจ้าหน้าที่ */}
                              <td className="py-3 px-4">
                                <div className="font-bold text-sm text-slate-800">
                                  {getNurseName(req.nurseId, req.nurseName)}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400">
                                  ID: {req.nurseId}
                                </div>
                              </td>

                              {/* ช่วงวันที่ลา */}
                              <td className="py-3 px-4 font-medium text-slate-700">
                                <div className="flex items-center gap-1.5">
                                  <ClockIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  <span>{req.startDate} ถึง {req.endDate}</span>
                                </div>
                              </td>

                              {/* เหตุผลการลา */}
                              <td className="py-3 px-4 text-slate-600">
                                {req.reason ? (
                                  <span className="italic">{req.reason}</span>
                                ) : (
                                  <span className="text-slate-300 italic">- ไม่ได้ระบุเหตุผล -</span>
                                )}
                              </td>

                              {/* สถานะ (Status Badge) */}
                              <td className="py-3 px-4 text-center">
                                {isPending && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    <span>⏳</span> รออนุมัติ
                                  </span>
                                )}
                                {isApproved && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircleIcon className="w-3.5 h-3.5" /> อนุมัติแล้ว
                                  </span>
                                )}
                                {!isPending && !isApproved && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    <XCircleIcon className="w-3.5 h-3.5" /> ปฏิเสธ
                                  </span>
                                )}
                              </td>

                              {/* การจัดการ (Actions) */}
                              <td className="py-3 px-4 text-right">
                                {isPending ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => void handleApprove(req.id)}
                                      disabled={actionId === req.id}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1 shadow-xs"
                                      title="อนุมัติและลงเวร L ในตาราง"
                                    >
                                      <span>✓</span>
                                      <span>อนุมัติ</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleReject(req.id)}
                                      disabled={actionId === req.id}
                                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                                      title="ปฏิเสธคำขอลา"
                                    >
                                      ปฏิเสธ
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    {req.approver ? `โดย ${req.approver}` : "-"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Bar */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 text-xs text-slate-600">
                  <div>
                    แสดงแถวที่ <strong>{totalItems > 0 ? startIndex + 1 : 0}</strong> ถึง{" "}
                    <strong>{Math.min(startIndex + PAGE_SIZE, totalItems)}</strong> จากทั้งหมด{" "}
                    <strong>{totalItems}</strong> รายการ
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={validCurrentPage <= 1}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition"
                        title="หน้าก่อนหน้า"
                      >
                        <ChevronLeftIcon className="w-4 h-4" />
                      </button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                            validCurrentPage === page
                              ? "bg-blue-600 text-white shadow-xs"
                              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {page}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={validCurrentPage >= totalPages}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition"
                        title="หน้าถัดไป"
                      >
                        <ChevronRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Create Leave Form */
            <form onSubmit={handleCreateLeave} className="max-w-xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 my-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-bold text-slate-800 text-sm">➕ ยื่นคำขอลาใหม่ (New Leave Request)</h4>
                <button
                  type="button"
                  onClick={() => setTab("list")}
                  className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
                >
                  ← กลับไปหน้ารายการ
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  เลือกพยาบาล/เจ้าหน้าที่ <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedNurseId}
                  onChange={(e) => setSelectedNurseId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- เลือกเจ้าหน้าที่ --</option>
                  {nurses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.position}) - ID: {n.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ประเภทการลา <span className="text-rose-500">*</span>
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ลาพักผ่อน">ลาพักผ่อน (Vacation Leave)</option>
                  <option value="ลากิจ">ลากิจ (Personal Leave)</option>
                  <option value="ลาป่วย">ลาป่วย (Sick Leave)</option>
                  <option value="ลาคลอด">ลาคลอด (Maternity Leave)</option>
                  <option value="ลาศึกษาต่อ/อบรม">ลาศึกษาต่อ/อบรม (Training Leave)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    วันที่เริ่มต้น <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    วันที่สิ้นสุด <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  เหตุผลการลา (Reason)
                </label>
                <textarea
                  rows={2}
                  placeholder="ระบุเหตุผลความจำเป็นในการลา..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTab("list")}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-blue-600/20"
                >
                  {submitting ? "กำลังส่งคำขอ..." : "ยื่นคำขอลา"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
