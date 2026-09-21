"use client";

import { useState } from "react";
import { request } from "@/lib/api";
import type { Ward } from "@/types/schedule";
import {
  BuildingOffice2Icon,
  PlusIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ArrowRightCircleIcon,
  ArrowLeftIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

interface DepartmentPanelProps {
  token: string;
  wards: Ward[];
  currentWardId?: string;
  onRefreshWards: () => Promise<void>;
  onSelectWard?: (wardId: string) => void;
  onBackToGrid: () => void;
}

export function DepartmentPanel({
  token,
  wards,
  currentWardId,
  onRefreshWards,
  onSelectWard,
  onBackToGrid,
}: DepartmentPanelProps) {
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

  const totalActive = wards.filter((w) => w.isActive !== false).length;
  const totalInactive = wards.filter((w) => w.isActive === false).length;

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
              <span className="text-xl">🏥</span>
              <h2 className="text-lg font-bold text-slate-800">บริหารจัดการแผนก / หอผู้ป่วย (Department Management)</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              จัดการข้อมูลหอผู้ป่วย แผนกการรักษา Timezone และสถานะการเปิด/ปิดใช้งานหน่วยงาน
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void onRefreshWards()}
            disabled={busy}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-2xs"
          >
            <ArrowPathIcon className={`w-4 h-4 ${busy ? "animate-spin text-blue-600" : ""}`} />
            <span>รีเฟรช</span>
          </button>
          {mode === "list" && (
            <button
              type="button"
              onClick={handleStartCreate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm shadow-blue-600/20"
            >
              <PlusIcon className="w-4 h-4" />
              <span>เพิ่มแผนกใหม่</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl">
          <div className="text-[11px] font-bold text-blue-800">แผนกทั้งหมด (Total Wards)</div>
          <div className="text-2xl font-black text-blue-950 mt-0.5">{wards.length} <span className="text-xs font-semibold text-blue-700">หน่วยงาน</span></div>
        </div>
        <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
          <div className="text-[11px] font-bold text-emerald-800">เปิดใช้งาน (Active)</div>
          <div className="text-2xl font-black text-emerald-950 mt-0.5">{totalActive} <span className="text-xs font-semibold text-emerald-700">หน่วยงาน</span></div>
        </div>
        <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-2xl">
          <div className="text-[11px] font-bold text-slate-700">ปิดใช้งาน (Inactive)</div>
          <div className="text-2xl font-black text-slate-900 mt-0.5">{totalInactive} <span className="text-xs font-semibold text-slate-600">หน่วยงาน</span></div>
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

      {mode !== "list" ? (
        /* Create / Edit Form */
        <form onSubmit={mode === "create" ? handleSaveCreate : handleSaveEdit} className="bg-slate-50/70 border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                {mode === "create" ? "➕ สร้างหน่วยงาน / หอผู้ป่วยใหม่" : `✏️ แก้ไขข้อมูลหน่วยงาน: ${selectedWard?.name}`}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">กรอกรหัสและข้อมูลทั่วไปของหอผู้ป่วย</p>
            </div>
            <button
              type="button"
              onClick={() => setMode("list")}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold transition shadow-2xs"
            >
              ← ยกเลิกและกลับหน้ารายการ
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                รหัสหน่วยงาน (Ward ID) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={mode === "edit"}
                placeholder="เช่น ward-icu, ward-er, ward-med"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 disabled:bg-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">ตัวอักษรภาษาอังกฤษ ตัวเลข และขีดกลาง (ไม่สามารถแก้ไขได้ภายหลัง)</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ชื่อหน่วยงาน (Ward Name) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="เช่น หอผู้ป่วยวิกฤต (ICU)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                เขตเวลา (Timezone)
              </label>
              <div className="relative">
                <GlobeAltIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                สถานะการใช้งาน
              </label>
              <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-blue-400 transition shadow-2xs mt-1">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800">เปิดใช้งานในระบบจัดตารางเวร</span>
                  <p className="text-[10px] text-slate-500">Active ward for scheduling</p>
                </div>
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                รายละเอียด / คำอธิบายเพิ่มเติม
              </label>
              <textarea
                rows={2}
                placeholder="เช่น รองรับผู้ป่วยวิกฤต 12 เตียง ให้บริการตลอด 24 ชั่วโมง"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setMode("list")}
              className="px-5 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-blue-600/20"
            >
              {busy ? "กำลังบันทึก..." : mode === "create" ? "ยืนยันสร้างหน่วยงาน" : "บันทึกการแก้ไข"}
            </button>
          </div>
        </form>
      ) : (
        /* Ward Table View */
        <div className="space-y-4">
          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อแผนก, รหัส ID, รายละเอียด..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <span className="text-xs text-slate-500 font-bold whitespace-nowrap">สถานะ:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              >
                <option value="all">ทั้งหมด (All Wards)</option>
                <option value="active">เปิดใช้งานอยู่ (Active)</option>
                <option value="inactive">ปิดใช้งาน (Inactive)</option>
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
                    <th className="py-3 px-4 min-w-[200px]">ชื่อหน่วยงาน / หอผู้ป่วย</th>
                    <th className="py-3 px-3 w-36">รหัส (Ward ID)</th>
                    <th className="py-3 px-3 min-w-[220px]">รายละเอียด</th>
                    <th className="py-3 px-3 text-center w-28">Timezone</th>
                    <th className="py-3 px-3 text-center w-28">สถานะ</th>
                    <th className="py-3 px-4 text-right w-44">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWards.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        ไม่พบข้อมูลหน่วยงานที่ตรงกับเงื่อนไขการค้นหา
                      </td>
                    </tr>
                  ) : (
                    filteredWards.map((w, idx) => {
                      const isCurrent = currentWardId === w.id;
                      const active = w.isActive !== false;
                      return (
                        <tr
                          key={w.id}
                          className={`hover:bg-slate-50/80 transition ${isCurrent ? "bg-blue-50/30 font-semibold" : ""}`}
                        >
                          <td className="py-3 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-slate-800">{w.name}</div>
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                                  วอร์ดปัจจุบัน
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-500">{w.id}</td>
                          <td className="py-3 px-3 text-slate-500 truncate max-w-xs">{w.description || "-"}</td>
                          <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-500">{w.timezone || "Asia/Bangkok"}</td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => void handleToggleStatus(w)}
                              disabled={busy}
                              title="คลิกเพื่อเปลี่ยนสถานะ"
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition flex items-center justify-center gap-1 mx-auto ${
                                active
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-600" : "bg-slate-400"}`} />
                              <span>{active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {onSelectWard && !isCurrent && active && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectWard(w.id);
                                    onBackToGrid();
                                  }}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1"
                                  title="สลับไปจัดเวรหน่วยงานนี้"
                                >
                                  <ArrowRightCircleIcon className="w-3.5 h-3.5" />
                                  <span>เลือกวอร์ดนี้</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStartEdit(w)}
                                className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg transition"
                                title="แก้ไขข้อมูล"
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
    </div>
  );
}
