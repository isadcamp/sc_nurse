"use client";

import {
  UsersIcon,
  PlusIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState, useMemo } from "react";
import { request } from "@/lib/api";
import type { Nurse } from "@/types/schedule";

interface StaffPanelProps {
  wardId: string;
  wardName: string;
  token: string;
  onStaffChanged: () => void;
  onBackToGrid: () => void;
}

const ALL_SHIFTS = ["ช", "บ", "ด", "ชบ", "บด", "Day", "Night", "D", "N", "X", "L", "V"];
const PAGE_SIZE = 12;

export function StaffPanel({
  wardId,
  wardName,
  token,
  onStaffChanged,
  onBackToGrid,
}: StaffPanelProps) {
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
    if (wardId) {
      queueMicrotask(() => { void fetchNurses(); });
      setFormMode(null);
      setCurrentPage(1);
      setSearchQuery("");
      setError("");
      setNotice("");
    }
  }, [wardId, fetchNurses]);

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

  // Stats
  const totalRN = nurses.filter((n) => n.position === "RN").length;
  const totalPN = nurses.filter((n) => n.position === "PN").length;
  const totalActive = nurses.filter((n) => n.isActive).length;
  const totalPT = nurses.filter((n) => n.isPartTime).length;

  // Pagination calculation
  const totalItems = filteredNurses.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * PAGE_SIZE;
  const paginatedNurses = filteredNurses.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToGrid}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-2xs flex items-center gap-1 text-xs font-bold"
            title="กลับสู่หน้าตารางเวร"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">กลับสู่ตารางเวร</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">👩‍⚕️</span>
              <h2 className="text-lg font-bold text-slate-800">จัดการบุคลากรประจำหอผู้ป่วย</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                {wardName || wardId}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              กำหนดข้อมูลพยาบาล ตำแหน่งวิชาชีพ ทักษะ สิทธิ์ขึ้นเวรควบ และสถานะความพร้อมปฏิบัติงาน
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void fetchNurses()}
            disabled={loading}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-2xs"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
            <span>รีเฟรช</span>
          </button>
          {formMode === null && (
            <button
              type="button"
              onClick={openAddForm}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm shadow-blue-600/20"
            >
              <PlusIcon className="w-4 h-4" />
              <span>เพิ่มบุคลากรใหม่</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl">
          <div className="text-[11px] font-bold text-blue-800">RN (พยาบาลวิชาชีพ)</div>
          <div className="text-2xl font-black text-blue-950 mt-0.5">{totalRN} <span className="text-xs font-semibold text-blue-700">คน</span></div>
        </div>
        <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
          <div className="text-[11px] font-bold text-emerald-800">PN (ผู้ช่วยพยาบาล)</div>
          <div className="text-2xl font-black text-emerald-950 mt-0.5">{totalPN} <span className="text-xs font-semibold text-emerald-700">คน</span></div>
        </div>
        <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-2xl">
          <div className="text-[11px] font-bold text-purple-800">Part-Time (PT)</div>
          <div className="text-2xl font-black text-purple-950 mt-0.5">{totalPT} <span className="text-xs font-semibold text-purple-700">คน</span></div>
        </div>
        <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-2xl">
          <div className="text-[11px] font-bold text-slate-700">พร้อมปฏิบัติงาน (Active)</div>
          <div className="text-2xl font-black text-slate-900 mt-0.5">{totalActive} / {nurses.length} <span className="text-xs font-semibold text-slate-600">คน</span></div>
        </div>
      </div>

      {/* Notice & Error */}
      {notice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice("")} className="text-emerald-600 hover:text-emerald-900 font-bold px-1">✕</button>
        </div>
      )}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircleIcon className="w-5 h-5 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900 font-bold px-1">✕</button>
        </div>
      )}

      {formMode !== null ? (
        /* Form View */
        <form onSubmit={handleSaveNurse} className="bg-slate-50/70 border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                {formMode === "add" ? "➕ เพิ่มบุคลากรใหม่เข้าสู่หน่วยงาน" : `✏️ แก้ไขข้อมูลบุคลากร: ${formName}`}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">ระบุรายละเอียดข้อมูลส่วนบุคคลและสิทธิ์การทำงาน</p>
            </div>
            <button
              type="button"
              onClick={() => setFormMode(null)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold transition shadow-2xs"
            >
              ← ยกเลิกและกลับหน้ารายการ
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                รหัสพยาบาล (Nurse ID / รหัสพนักงาน) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={formMode !== "add"}
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="เช่น 558210"
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 disabled:bg-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ชื่อ-นามสกุล <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="เช่น พว. อภิญญา ประทุมตรี"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ตำแหน่งวิชาชีพ (Position) <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-4 items-center mt-2">
                <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="position"
                    value="RN"
                    checked={formPosition === "RN"}
                    onChange={() => setFormPosition("RN")}
                    className="accent-blue-600 w-4 h-4"
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
                    className="accent-emerald-600 w-4 h-4"
                  />
                  <span className="font-bold text-emerald-700">PN (ผู้ช่วยพยาบาล)</span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ทักษะเฉพาะ (Skills - คั่นด้วยเครื่องหมายจุลภาค ,)
              </label>
              <input
                type="text"
                placeholder="เช่น icu, er, triage, chemo, dialyze"
                value={formSkills}
                onChange={(e) => setFormSkills(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Special Permissions */}
          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-700 mb-3">คุณสมบัติพิเศษและสิทธิ์การขึ้นเวร</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <label className="flex items-center gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:border-blue-400 transition shadow-2xs">
                <input
                  type="checkbox"
                  checked={formIsCharge}
                  onChange={(e) => setFormIsCharge(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">เป็นหัวหน้าเวรได้</div>
                  <div className="text-[10px] text-slate-500">In-charge eligible</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:border-blue-400 transition shadow-2xs">
                <input
                  type="checkbox"
                  checked={formCanDouble}
                  onChange={(e) => setFormCanDouble(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">ขึ้นเวรควบได้ (16 ชม.)</div>
                  <div className="text-[10px] text-slate-500">Double shift (ชบ, บด)</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-purple-50/70 border border-purple-200 rounded-2xl cursor-pointer hover:border-purple-300 transition shadow-2xs">
                <input
                  type="checkbox"
                  checked={formIsPartTime}
                  onChange={(e) => setFormIsPartTime(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <div className="text-xs font-bold text-purple-900 flex items-center gap-1">
                    <span>พาร์ทไทม์ (PT)</span>
                    <span className="px-1 py-0.2 rounded text-[9px] bg-purple-200 text-purple-900 font-black">PT</span>
                  </div>
                  <div className="text-[10px] text-purple-700">จัดเป็นลำดับสองเมื่อคนไม่พอ</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:border-blue-400 transition shadow-2xs">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">สถานะปฏิบัติงาน</div>
                  <div className="text-[10px] text-slate-500">{formIsActive ? "พร้อมจัดตารางเวร" : "ระงับชั่วคราว"}</div>
                </div>
              </label>
            </div>
          </div>

          {/* Allowed Shifts Selection */}
          <div className="pt-4 border-t border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-2.5">
              สิทธิ์การขึ้นประเภทเวร (Allowed Shifts)
            </label>
            <div className="flex flex-wrap gap-2.5">
              {ALL_SHIFTS.filter((s) => s !== "X" && s !== "L").map((code, cIdx) => {
                const isChecked = formAllowedShifts.includes(code);
                return (
                  <label
                    key={`${code}_${cIdx}`}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs cursor-pointer transition shadow-2xs ${
                      isChecked
                        ? "bg-blue-50 border-blue-300 text-blue-900 font-bold"
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

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setFormMode(null)}
              className="px-5 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-blue-600/20"
            >
              {busy ? "กำลังบันทึก..." : formMode === "add" ? "ยืนยันเพิ่มเจ้าหน้าที่" : "บันทึกการแก้ไข"}
            </button>
          </div>
        </form>
      ) : (
        /* Staff Table View */
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัส ID, ทักษะ..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap justify-end">
              <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs text-xs">
                <button
                  type="button"
                  onClick={() => { setPositionFilter("all"); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${positionFilter === "all" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                >
                  ทั้งหมด ({nurses.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setPositionFilter("RN"); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${positionFilter === "RN" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                >
                  RN ({totalRN})
                </button>
                <button
                  type="button"
                  onClick={() => { setPositionFilter("PN"); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${positionFilter === "PN" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                >
                  PN ({totalPN})
                </button>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "all" | "active" | "inactive");
                  setCurrentPage(1);
                }}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              >
                <option value="all">สถานะทั้งหมด</option>
                <option value="active">พร้อมปฏิบัติงาน (Active)</option>
                <option value="inactive">ระงับชั่วคราว (Inactive)</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 min-w-[200px]">ชื่อ-นามสกุล / รหัส ID</th>
                    <th className="py-3 px-3 text-center w-24">ตำแหน่ง</th>
                    <th className="py-3 px-3 text-center w-28">สิทธิ์เวรควบ</th>
                    <th className="py-3 px-3 min-w-[140px]">ทักษะเฉพาะ</th>
                    <th className="py-3 px-3 min-w-[160px]">เวรที่อนุญาต</th>
                    <th className="py-3 px-3 text-center w-28">สถานะ</th>
                    <th className="py-3 px-4 text-right w-24">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && nurses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                        <span>กำลังโหลดข้อมูลเจ้าหน้าที่...</span>
                      </td>
                    </tr>
                  ) : paginatedNurses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        ไม่พบข้อมูลบุคลากรที่ตรงกับเงื่อนไขการค้นหา
                      </td>
                    </tr>
                  ) : (
                    paginatedNurses.map((nurse, idx) => {
                      const isRN = nurse.position === "RN";
                      return (
                        <tr
                          key={`${nurse.id || "nurse"}_${idx}`}
                          className={`hover:bg-slate-50/80 transition ${!nurse.isActive ? "bg-slate-50/40 opacity-70" : ""}`}
                        >
                          <td className="py-3 px-4 text-center font-bold text-slate-400">
                            {startIndex + idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                  <span>{nurse.name}</span>
                                  {nurse.isChargeEligible && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800" title="หัวหน้าเวร (In-charge)">
                                      IC
                                    </span>
                                  )}
                                  {nurse.isPartTime && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800" title="Part-Time">
                                      PT
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">{nurse.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                                isRN
                                  ? "bg-blue-100 text-blue-800 border border-blue-200"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              {nurse.position || "RN"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {nurse.canDoubleShift ? (
                              <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg">
                                ควบได้ (16h)
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">เวรเดี่ยว</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {nurse.skills && nurse.skills.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {nurse.skills.map((sk, skIdx) => (
                                  <span key={`${sk}_${skIdx}`} className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold">
                                    {sk}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1">
                              {(nurse.allowedShiftCodes && nurse.allowedShiftCodes.length > 0
                                ? nurse.allowedShiftCodes
                                : ALL_SHIFTS
                              )
                                .filter((s) => s !== "X" && s !== "L")
                                .slice(0, 5)
                                .map((s, sIdx) => (
                                  <span key={`${s}_${sIdx}`} className="px-1.5 py-0.2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">
                                    {s}
                                  </span>
                                ))}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => void toggleStatus(nurse)}
                              disabled={busy}
                              title="คลิกเพื่อเปลี่ยนสถานะ"
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition flex items-center justify-center gap-1 mx-auto ${
                                nurse.isActive
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${nurse.isActive ? "bg-emerald-600" : "bg-slate-400"}`} />
                              <span>{nurse.isActive ? "พร้อมจัด" : "ระงับ"}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openEditForm(nurse)}
                              className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg transition"
                              title="แก้ไขข้อมูล"
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <div>
                  แสดง <strong>{startIndex + 1}</strong> ถึง <strong>{Math.min(startIndex + PAGE_SIZE, totalItems)}</strong> จากทั้งหมด <strong>{totalItems}</strong> คน
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={validCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-bold text-slate-800">
                    หน้า {validCurrentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={validCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
