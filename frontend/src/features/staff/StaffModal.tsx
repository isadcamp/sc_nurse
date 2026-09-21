"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";
import {
  UsersIcon,
  XMarkIcon,
  PlusIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState, useMemo } from "react";
import { request } from "@/lib/api";
import type { Nurse } from "@/types/schedule";

interface StaffModalProps {
  open: boolean;
  onClose: () => void;
  wardId: string;
  wardName: string;
  token: string;
  onStaffChanged: () => void;
}

const ALL_SHIFTS = ["ช", "บ", "ด", "ชบ", "บด", "Day", "Night", "D", "N", "X", "L"];
const PAGE_SIZE = 10;

export function StaffModal({
  open,
  onClose,
  wardId,
  wardName,
  token,
  onStaffChanged,
}: StaffModalProps) {
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Search & Filter & Pagination states
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<"all" | "RN" | "PN">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Form Mode: null (List) | "add" | Nurse (Edit)
  const [formMode, setFormMode] = useState<"add" | Nurse | null>(null);

  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formPosition, setFormPosition] = useState<"RN" | "PN">("RN");
  const [formIsCharge, setFormIsCharge] = useState(false);
  const [formCanDouble, setFormCanDouble] = useState(true);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsPartTime, setFormIsPartTime] = useState(false);
  const [formSkills, setFormSkills] = useState("");
  const [formAllowedShifts, setFormAllowedShifts] = useState<string[]>(ALL_SHIFTS);

  const fetchNurses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await request<{ data: Nurse[] }>(`/wards/${wardId}/nurses`, token);
      setNurses(res.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลเจ้าหน้าที่ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [token, wardId]);

  useEffect(() => {
    if (open && wardId) {
      queueMicrotask(() => { void fetchNurses(); });
      setFormMode(null);
      setCurrentPage(1);
      setSearchQuery("");
      setError("");
      setNotice("");
    }
  }, [open, wardId, fetchNurses]);

  function openAddForm() {
    setFormMode("add");
    setFormId(`nurse-${wardId}-${Date.now().toString().slice(-4)}`);
    setFormName("");
    setFormPosition("RN");
    setFormIsCharge(false);
    setFormCanDouble(true);
    setFormIsActive(true);
    setFormIsPartTime(false);
    setFormSkills("");
    setFormAllowedShifts(ALL_SHIFTS);
    setError("");
    setNotice("");
  }

  function openEditForm(nurse: Nurse) {
    setFormMode(nurse);
    setFormId(nurse.id);
    setFormName(nurse.name);
    setFormPosition(nurse.position || "RN");
    setFormIsCharge(nurse.isChargeEligible);
    setFormCanDouble(nurse.canDoubleShift);
    setFormIsActive(nurse.isActive);
    setFormIsPartTime(!!nurse.isPartTime);
    setFormSkills((nurse.skills || []).join(", "));
    setFormAllowedShifts(
      nurse.allowedShiftCodes && nurse.allowedShiftCodes.length > 0
        ? nurse.allowedShiftCodes
        : ALL_SHIFTS
    );
    setError("");
    setNotice("");
  }

  async function handleSaveNurse(e: React.FormEvent) {
    e.preventDefault();
    const targetId =
      formMode === "add"
        ? formId.trim()
        : typeof formMode === "object" && formMode
        ? formMode.id
        : formId.trim();

    if (!targetId || !formName.trim()) {
      setError("กรุณากรอกรหัสและชื่อพยาบาล");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");

    const skillsArray = formSkills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (formMode === "add") {
        await request("/nurses", token, "POST", {
          id: targetId,
          wardId,
          name: formName.trim(),
          position: formPosition,
          isChargeEligible: formIsCharge,
          canDoubleShift: formCanDouble,
          isActive: formIsActive,
          isPartTime: formIsPartTime,
          skills: skillsArray,
          allowedShiftCodes: formAllowedShifts,
        });
        setNotice(`เพิ่มบุคลากร ${formName} เรียบร้อยแล้ว`);
      } else {
        await request(`/nurses/${encodeURIComponent(targetId)}`, token, "PUT", {
          name: formName.trim(),
          position: formPosition,
          isChargeEligible: formIsCharge,
          canDoubleShift: formCanDouble,
          isActive: formIsActive,
          isPartTime: formIsPartTime,
          skills: skillsArray,
          allowedShiftCodes: formAllowedShifts,
        });
        setNotice(`แก้ไขข้อมูล ${formName} เรียบร้อยแล้ว`);
      }
      setFormMode(null);
      await fetchNurses();
      onStaffChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(nurse: Nurse) {
    const nextStatus = !nurse.isActive;
    setBusy(true);
    setError("");
    try {
      await request(`/nurses/${nurse.id}/status`, token, "PATCH", {
        isActive: nextStatus,
      });
      await fetchNurses();
      onStaffChanged();
      setNotice(`ปรับสถานะของ ${nurse.name} เป็น ${nextStatus ? "พร้อมปฏิบัติงาน" : "ระงับชั่วคราว"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // Filtered list
  const filteredNurses = useMemo(() => {
    return nurses.filter((n) => {
      const matchQuery =
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.skills && n.skills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase())));
      const matchPosition = positionFilter === "all" || n.position === positionFilter;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && n.isActive) ||
        (statusFilter === "inactive" && !n.isActive);
      return matchQuery && matchPosition && matchStatus;
    });
  }, [nurses, searchQuery, positionFilter, statusFilter]);

  // Pagination calculation
  const totalItems = filteredNurses.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * PAGE_SIZE;
  const paginatedNurses = filteredNurses.slice(startIndex, startIndex + PAGE_SIZE);

  if (!open) return null;

  return (
    <ModalFrame title="จัดการบุคลากรประจำหอผู้ป่วย" onClose={onClose}>
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-[92vw] md:w-[66.67vw] max-w-6xl h-[75vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <UsersIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                จัดการบุคลากรประจำหอผู้ป่วย: {wardName} ({wardId})
              </h3>
              <p className="text-xs text-slate-400">
                เพิ่ม/แก้ไขรายชื่อ ตำแหน่ง ทักษะเฉพาะ และสิทธิ์การขึ้นเวรของพยาบาลในหน่วยงาน
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {formMode === null && (
              <button
                type="button"
                onClick={openAddForm}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
              >
                <PlusIcon className="w-4 h-4" />
                <span>เพิ่มบุคลากร</span>
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
        {notice && (
          <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center justify-between shrink-0">
            <span>✅ {notice}</span>
            <button onClick={() => setNotice("")} className="text-emerald-600 hover:text-emerald-900 font-bold px-1">✕</button>
          </div>
        )}
        {error && (
          <div className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-xs font-semibold text-rose-800 flex items-center justify-between shrink-0">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900 font-bold px-1">✕</button>
          </div>
        )}

        {/* Body Container */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/60 flex flex-col">
          {formMode !== null ? (
            /* Form Mode View */
            <form onSubmit={handleSaveNurse} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 max-w-2xl mx-auto shadow-sm my-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-bold text-slate-800 text-sm">
                  {formMode === "add" ? "➕ เพิ่มบุคลากรใหม่" : `✏️ แก้ไขข้อมูล: ${formName}`}
                </h4>
                <button
                  type="button"
                  onClick={() => setFormMode(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
                >
                  ← กลับไปหน้ารายการ
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสพยาบาล (Nurse ID) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={formMode !== "add"}
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 disabled:opacity-60 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น พว. กานดา อบอุ่น"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ตำแหน่งวิชาชีพ (Position) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-4 items-center mt-1.5">
                    <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="position"
                        value="RN"
                        checked={formPosition === "RN"}
                        onChange={() => setFormPosition("RN")}
                        className="accent-blue-600"
                      />
                      <span className="font-bold text-blue-700">RN (พยาบาลวิชาชีพ)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="position"
                        value="PN"
                        checked={formPosition === "PN"}
                        onChange={() => setFormPosition("PN")}
                        className="accent-emerald-600"
                      />
                      <span className="font-bold text-emerald-700">PN (ผู้ช่วยพยาบาล)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ทักษะเฉพาะ (Skills - คั่นด้วยจุลภาค)
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น icu, er, triage, chemo"
                    value={formSkills}
                    onChange={(e) => setFormSkills(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Special Permissions */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 transition">
                  <input
                    type="checkbox"
                    checked={formIsCharge}
                    onChange={(e) => setFormIsCharge(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">เป็นหัวหน้าเวรได้</div>
                    <div className="text-[10px] text-slate-500">In-charge eligible</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 transition">
                  <input
                    type="checkbox"
                    checked={formCanDouble}
                    onChange={(e) => setFormCanDouble(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">ขึ้นเวรควบได้ (16 ชม.)</div>
                    <div className="text-[10px] text-slate-500">Double shift (ชบ, บด)</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 bg-purple-50/70 border border-purple-200 rounded-xl cursor-pointer hover:border-purple-300 transition">
                  <input
                    type="checkbox"
                    checked={formIsPartTime}
                    onChange={(e) => setFormIsPartTime(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-purple-900 flex items-center gap-1">
                      <span>พาร์ทไทม์ (PT)</span>
                      <span className="px-1 py-0.2 rounded text-[9px] bg-purple-200 text-purple-900 font-extrabold">PT</span>
                    </div>
                    <div className="text-[10px] text-purple-700">จัดเป็นลำดับสองเมื่อคนไม่พอ</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 transition">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">สถานะปฏิบัติงาน</div>
                    <div className="text-[10px] text-slate-500">{formIsActive ? "พร้อมจัดตารางเวร" : "ระงับชั่วคราว"}</div>
                  </div>
                </label>
              </div>

              {/* Allowed Shifts Selection */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  สิทธิ์การขึ้นประเภทเวร (Allowed Shifts)
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SHIFTS.filter((s) => s !== "X" && s !== "L").map((code) => {
                    const isChecked = formAllowedShifts.includes(code);
                    return (
                      <label
                        key={code}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked
                            ? "bg-blue-50 border-blue-300 text-blue-800 font-bold"
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormAllowedShifts([...formAllowedShifts, code]);
                            } else {
                              setFormAllowedShifts(formAllowedShifts.filter((c) => c !== code));
                            }
                          }}
                          className="text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span>เวร {code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormMode(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-blue-600/20"
                >
                  {busy ? "กำลังบันทึก..." : formMode === "add" ? "ยืนยันเพิ่มเจ้าหน้าที่" : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          ) : (
            /* Staff Table List View with Pagination */
            <div className="space-y-4 h-full flex flex-col">
              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="relative w-full sm:w-80">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อ, รหัส ID, ทักษะ..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">ตำแหน่ง:</span>
                  <select
                    value={positionFilter}
                    onChange={(e) => {
                      setPositionFilter(e.target.value as "all" | "RN" | "PN");
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  >
                    <option value="all">ทั้งหมด (All)</option>
                    <option value="RN">RN (พยาบาลวิชาชีพ)</option>
                    <option value="PN">PN (ผู้ช่วยพยาบาล)</option>
                  </select>

                  <span className="text-xs text-slate-500 font-semibold whitespace-nowrap ml-1">สถานะ:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as "all" | "active" | "inactive");
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  >
                    <option value="all">ทั้งหมด (All)</option>
                    <option value="active">พร้อมทำงาน</option>
                    <option value="inactive">ระงับชั่วคราว</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void fetchNurses()}
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
                        <th className="py-3 px-4 w-32">รหัสบุคลากร</th>
                        <th className="py-3 px-4">ชื่อ-นามสกุล</th>
                        <th className="py-3 px-4 w-28 text-center">ตำแหน่ง</th>
                        <th className="py-3 px-4">คุณสมบัติ / ทักษะ</th>
                        <th className="py-3 px-4 w-36 text-center">สถานะปฏิบัติงาน</th>
                        <th className="py-3 px-4 w-24 text-right">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            กำลังโหลดข้อมูลบุคลากร...
                          </td>
                        </tr>
                      ) : paginatedNurses.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            ไม่พบข้อมูลบุคลากรในหอผู้ป่วยนี้
                          </td>
                        </tr>
                      ) : (
                        paginatedNurses.map((nurse, index) => {
                          const serialNumber = startIndex + index + 1;
                          return (
                            <tr
                              key={nurse.id}
                              className={`hover:bg-slate-50 transition ${
                                !nurse.isActive ? "bg-slate-50/50 text-slate-400" : ""
                              }`}
                            >
                              {/* ลำดับ (Sequential Index) */}
                              <td className="py-3 px-4 text-center font-bold text-slate-500">
                                {serialNumber}
                              </td>

                              {/* รหัส ID */}
                              <td className="py-3 px-4 font-mono font-bold">
                                <span className={`px-2 py-0.5 rounded-md text-[11px] border ${
                                  nurse.isActive
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-slate-50 text-slate-400 border-slate-200"
                                }`}>
                                  {nurse.id}
                                </span>
                              </td>

                              {/* ชื่อ-นามสกุล */}
                              <td className="py-3 px-4">
                                <div className={`font-bold text-sm flex items-center gap-1.5 ${nurse.isActive ? "text-slate-800" : "text-slate-500"}`}>
                                  <span>{nurse.name}</span>
                                  {nurse.isPartTime && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 font-extrabold" title="พยาบาลพาร์ทไทม์ (Part-time)">
                                      PT
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* ตำแหน่งวิชาชีพ */}
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-md font-bold text-xs border ${
                                    nurse.position === "RN"
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  }`}
                                >
                                  {nurse.position || "RN"}
                                </span>
                              </td>

                              {/* คุณสมบัติ / ทักษะ */}
                              <td className="py-3 px-4">
                                <div className="flex flex-wrap gap-1 items-center">
                                  {nurse.isPartTime && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-semibold">
                                      🕒 พาร์ทไทม์
                                    </span>
                                  )}
                                  {nurse.isChargeEligible && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                                      👑 หัวหน้าเวร
                                    </span>
                                  )}
                                  {nurse.canDoubleShift && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 font-semibold">
                                      ⚡ เวรควบ
                                    </span>
                                  )}
                                  {(nurse.skills || []).map((sk) => (
                                    <span
                                      key={sk}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium"
                                    >
                                      🏷️ {sk}
                                    </span>
                                  ))}
                                  {(!nurse.isPartTime && !nurse.isChargeEligible && !nurse.canDoubleShift && (!nurse.skills || nurse.skills.length === 0)) && (
                                    <span className="text-slate-300 text-[11px]">-</span>
                                  )}
                                </div>
                              </td>

                              {/* สถานะปฏิบัติงาน (Active Toggle) */}
                              <td className="py-3 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => void toggleStatus(nurse)}
                                  disabled={busy}
                                  title={nurse.isActive ? "คลิกเพื่อระงับการจัดเวรชั่วคราว" : "คลิกเพื่อเปิดใช้งาน"}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition shadow-xs cursor-pointer ${
                                    nurse.isActive
                                      ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                                  }`}
                                >
                                  {nurse.isActive ? (
                                    <>
                                      <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                                      <span>พร้อมทำงาน</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircleIcon className="w-4 h-4 text-rose-600" />
                                      <span>ระงับชั่วคราว</span>
                                    </>
                                  )}
                                </button>
                              </td>

                              {/* การจัดการ (Actions) */}
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => openEditForm(nurse)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="แก้ไขข้อมูลบุคลากร"
                                >
                                  <PencilSquareIcon className="w-4 h-4" />
                                </button>
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
                    <strong>{totalItems}</strong> คน
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
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
