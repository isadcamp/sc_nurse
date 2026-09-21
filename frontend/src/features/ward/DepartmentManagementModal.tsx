"use client";

import { useState } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { request } from "@/lib/api";
import type { Ward } from "@/types/schedule";
import {
  BuildingOffice2Icon,
  PlusIcon,
  XMarkIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  UsersIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ArrowRightCircleIcon,
} from "@heroicons/react/24/outline";

interface DepartmentManagementModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  wards: Ward[];
  onRefreshWards: () => Promise<void>;
  onSelectWard?: (wardId: string) => void;
}

export function DepartmentManagementModal({
  open,
  onClose,
  token,
  wards,
  onRefreshWards,
  onSelectWard,
}: DepartmentManagementModalProps) {
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);

  // Form states
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("Asia/Bangkok");
  const [isActive, setIsActive] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  if (!open) return null;

  function handleStartCreate() {
    setSelectedWard(null);
    setId("");
    setName("");
    setDescription("");
    setTimezone("Asia/Bangkok");
    setIsActive(true);
    setError("");
    setNotice("");
    setMode("create");
  }

  function handleStartEdit(w: Ward) {
    setSelectedWard(w);
    setId(w.id);
    setName(w.name);
    setDescription(w.description || "");
    setTimezone(w.timezone || "Asia/Bangkok");
    setIsActive(w.isActive !== false);
    setError("");
    setNotice("");
    setMode("edit");
  }

  async function handleSaveCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      setError("กรุณากรอกรหัสและชื่อแผนก");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/wards", token, "POST", {
        id: id.trim(),
        name: name.trim(),
        description: description.trim(),
        timezone: timezone.trim(),
        isActive,
      });
      setNotice("สร้างหน่วยงานสำเร็จ");
      await onRefreshWards();
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างหน่วยงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWard) return;
    setBusy(true);
    setError("");
    try {
      await request(`/wards/${selectedWard.id}`, token, "PUT", {
        name: name.trim(),
        description: description.trim(),
        timezone: timezone.trim(),
        isActive,
      });
      setNotice("แก้ไขข้อมูลหน่วยงานสำเร็จ");
      await onRefreshWards();
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "แก้ไขข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStatus(w: Ward) {
    const nextStatus = !(w.isActive !== false);
    setBusy(true);
    setError("");
    try {
      await request(`/wards/${w.id}/status`, token, "PATCH", {
        isActive: nextStatus,
      });
      setNotice(`${nextStatus ? "เปิดใช้งาน" : "ปิดการใช้งาน"}หน่วยงาน "${w.name}" เรียบร้อยแล้ว`);
      await onRefreshWards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const filteredWards = wards.filter((w) => {
    const matchQuery =
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.description && w.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const currentActive = w.isActive !== false;
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && currentActive) ||
      (statusFilter === "inactive" && !currentActive);
    return matchQuery && matchStatus;
  });

  return (
    <ModalFrame title="การจัดการแผนกและหน่วยงาน" onClose={onClose}>
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-[92vw] md:w-[66.67vw] max-w-6xl h-[75vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <BuildingOffice2Icon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">บริหารจัดการแผนก / หอผู้ป่วย (Department Management)</h3>
              <p className="text-xs text-slate-400">จัดการข้อมูลหอผู้ป่วย แผนกการรักษา และจำนวนบุคลากรประจำการ</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "list" && (
              <button
                type="button"
                onClick={handleStartCreate}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
              >
                <PlusIcon className="w-4 h-4" />
                <span>เพิ่มแผนกใหม่</span>
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/60">
          {mode === "list" && (
            <div className="space-y-4 h-full flex flex-col">
              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="relative w-full sm:w-80">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อแผนก, รหัสแผนก, คำอธิบาย..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">สถานะ:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  >
                    <option value="all">ทั้งหมด (All Wards)</option>
                    <option value="active">เปิดใช้งานอยู่ (Active)</option>
                    <option value="inactive">ปิดใช้งาน (Inactive)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void onRefreshWards()}
                    className="p-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition shadow-xs"
                    title="โหลดข้อมูลใหม่"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Department Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex-1 flex flex-col">
                <div className="overflow-y-auto max-h-[50vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-3 px-4 w-16 text-center">ลำดับ</th>
                        <th className="py-3 px-4 w-32">รหัสแผนก</th>
                        <th className="py-3 px-4">ชื่อแผนก / หอผู้ป่วย</th>
                        <th className="py-3 px-4">รายละเอียด / สถานที่</th>
                        <th className="py-3 px-4 w-28 text-center">บุคลากร</th>
                        <th className="py-3 px-4 w-36 text-center">สถานะการใช้งาน</th>
                        <th className="py-3 px-4 w-36 text-right">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredWards.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            {busy ? "กำลังโหลดข้อมูลแผนก..." : "ไม่พบข้อมูลแผนก / หอผู้ป่วย"}
                          </td>
                        </tr>
                      ) : (
                        filteredWards.map((w, index) => {
                          const active = w.isActive !== false;
                          return (
                            <tr
                              key={w.id}
                              className={`hover:bg-slate-50 transition ${
                                !active ? "bg-slate-50/50 text-slate-400" : ""
                              }`}
                            >
                              {/* ลำดับ (Sequential Index) */}
                              <td className="py-3 px-4 text-center font-bold text-slate-500">
                                {index + 1}
                              </td>

                              {/* รหัสแผนก */}
                              <td className="py-3 px-4 font-mono font-bold">
                                <span className={`px-2 py-0.5 rounded-md text-[11px] border ${
                                  active
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}>
                                  {w.id}
                                </span>
                              </td>

                              {/* ชื่อแผนก */}
                              <td className="py-3 px-4">
                                <div className={`font-bold text-sm ${active ? "text-slate-800" : "text-slate-500"}`}>
                                  {w.name}
                                </div>
                              </td>

                              {/* รายละเอียด */}
                              <td className="py-3 px-4 text-slate-500">
                                {w.description || <span className="text-slate-300 italic">- ไม่มีรายละเอียด -</span>}
                              </td>

                              {/* บุคลากร */}
                              <td className="py-3 px-4 text-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full font-semibold text-[11px]">
                                  <UsersIcon className="w-3.5 h-3.5 text-slate-500" />
                                  <span>{w.staffCount ?? 0} คน</span>
                                </span>
                              </td>

                              {/* สถานะการใช้งาน (Active / Inactive Toggle) */}
                              <td className="py-3 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => void handleToggleStatus(w)}
                                  disabled={busy}
                                  title={active ? "คลิกเพื่อปิดการใช้งานแผนกนี้" : "คลิกเพื่อเปิดใช้งานแผนกนี้"}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition shadow-xs cursor-pointer ${
                                    active
                                      ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                                  }`}
                                >
                                  {active ? (
                                    <>
                                      <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                                      <span>เปิดใช้งาน</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircleIcon className="w-4 h-4 text-rose-600" />
                                      <span>ปิดการใช้งาน</span>
                                    </>
                                  )}
                                </button>
                              </td>

                              {/* การจัดการ (Actions) */}
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {onSelectWard && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onSelectWard(w.id);
                                        onClose();
                                      }}
                                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                      title="เลือกดูตารางเวรแผนกนี้"
                                    >
                                      <ArrowRightCircleIcon className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(w)}
                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                    title="แก้ไขข้อมูลแผนก"
                                  >
                                    <PencilSquareIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {(mode === "create" || mode === "edit") && (
            <form onSubmit={mode === "create" ? handleSaveCreate : handleSaveEdit} className="space-y-4 max-w-xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="text-sm font-bold text-slate-800">
                  {mode === "create" ? "เพิ่มแผนก / หอผู้ป่วยใหม่ (New Ward)" : `แก้ไขข้อมูลแผนก: ${name}`}
                </h4>
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
                >
                  ← กลับไปหน้ารายการ
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัสแผนก (Ward ID / Code) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={mode === "edit"}
                  placeholder="เช่น ward-er, ward-icu, ward-med1"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อแผนก / หอผู้ป่วย (Ward Name) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น แผนกอุบัติเหตุและฉุกเฉิน (ER)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รายละเอียด / คำอธิบาย / สถานที่ตั้ง
                </label>
                <textarea
                  rows={2}
                  placeholder="เช่น อาคารเฉลิมพระเกียรติ ชั้น 3 โทร. 1234"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  เขตเวลา (Timezone)
                </label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="wardIsActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="wardIsActive" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  เปิดใช้งานแผนกนี้ (Active Ward)
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {busy ? "กำลังบันทึก..." : mode === "create" ? "สร้างแผนก" : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
