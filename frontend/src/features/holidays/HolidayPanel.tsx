"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CalendarDaysIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { request } from "@/lib/api";
import type { HolidayCalendar } from "@/types/schedule";

interface HolidayPanelProps {
  token: string;
  onBackToGrid: () => void;
}

export function HolidayPanel({ token, onBackToGrid }: HolidayPanelProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [calendar, setCalendar] = useState<HolidayCalendar | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchHolidays = useCallback(async (year: number) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await request<{ data: HolidayCalendar }>(`/holidays?year=${year}`, token);
      setCalendar(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดวันหยุดได้");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    queueMicrotask(() => { void fetchHolidays(selectedYear); });
  }, [selectedYear, fetchHolidays]);

  async function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate || !newName.trim()) {
      setError("กรุณากรอกวันที่และชื่อวันหยุด");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const existing = calendar?.holidays ?? [];
      const updatedList = [...existing.filter(h => h.date.split("T")[0] !== newDate), { date: newDate, name: newName.trim() }];
      updatedList.sort((a, b) => a.date.localeCompare(b.date));

      await request("/holidays", token, "POST", {
        year: selectedYear,
        holidays: updatedList.map(h => ({ date: h.date.split("T")[0], name: h.name })),
        draft: false,
      });
      setSuccess("เพิ่มวันหยุดสำเร็จ");
      setNewDate("");
      setNewName("");
      queueMicrotask(() => { void fetchHolidays(selectedYear); });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มวันหยุดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteHoliday(dateStr: string) {
    if (!confirm(`ต้องการลบวันหยุดวันที่ ${dateStr} ใช่หรือไม่?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const cleanDate = dateStr.split("T")[0];
      await request(`/holidays?year=${selectedYear}&date=${cleanDate}`, token, "DELETE");
      setSuccess("ลบวันหยุดสำเร็จ");
      queueMicrotask(() => { void fetchHolidays(selectedYear); });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบวันหยุดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyYear() {
    const nextYear = selectedYear + 1;
    if (!confirm(`ต้องการคัดลอกวันหยุดจากปี พ.ศ. ${selectedYear + 543} ไปยังปี พ.ศ. ${nextYear + 543} ใช่หรือไม่?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await request("/holidays/copy-year", token, "POST", {
        sourceYear: selectedYear,
        destinationYear: nextYear,
      });
      setSuccess(`คัดลอกวันหยุดไปยังปี พ.ศ. ${nextYear + 543} สำเร็จ`);
      setSelectedYear(nextYear);
    } catch (err) {
      setError(err instanceof Error ? err.message : "คัดลอกวันหยุดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const holidays = calendar?.holidays ?? [];

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
              <span className="text-xl">📅</span>
              <h2 className="text-lg font-bold text-slate-800">
                ปฏิทินวันหยุดนักขัตฤกษ์และประเพณี (Holiday Calendar)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              จัดการวันหยุดประจำปีเพื่อใช้ในการคำนวณวันทำการ โควตา และวางแผนจัดตารางเวร
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
            <span className="text-xs font-bold text-slate-700">ปี พ.ศ.:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs text-blue-700 font-bold focus:outline-none cursor-pointer"
            >
              {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                <option key={y} value={y}>
                  พ.ศ. {y + 543} ({y})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleCopyYear}
            disabled={saving || loading}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
            title="คัดลอกวันหยุดทั้งหมดของปีนี้ไปยังปีถัดไป"
          >
            <span>📋</span>
            <span>คัดลอกไปปี พ.ศ. {selectedYear + 543 + 1}</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchHolidays(selectedYear)}
            disabled={loading}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-2xs"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Notice & Error */}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess("")} className="text-emerald-600 hover:text-emerald-900 font-bold px-1">✕</button>
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

      {/* Add Holiday Form Card */}
      <form onSubmit={handleAddHoliday} className="p-5 bg-gradient-to-r from-blue-50/60 to-indigo-50/50 border border-blue-200/80 rounded-3xl space-y-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <PlusIcon className="w-4 h-4 text-blue-600" />
          <span>เพิ่มวันหยุดใหม่ ประจำปี พ.ศ. {selectedYear + 543}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-4">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              required
            />
          </div>
          <div className="sm:col-span-6">
            <input
              type="text"
              placeholder="ชื่อวันหยุด เช่น วันสงกรานต์, วันขึ้นปีใหม่, วันหยุดประเพณีท้องถิ่น"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-blue-600/20"
            >
              {saving ? "กำลังเพิ่ม..." : "+ เพิ่มวันหยุด"}
            </button>
          </div>
        </div>
      </form>

      {/* Holiday List Grid */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-800">
            รายการวันหยุดทั้งหมด ประจำปี พ.ศ. {selectedYear + 543} ({holidays.length} วัน)
          </h3>
          <span className="text-xs text-slate-500">เรียงตามลำดับวันที่</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            <span>กำลังโหลดข้อมูลวันหยุด...</span>
          </div>
        ) : holidays.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            ยังไม่มีรายการวันหยุดสำหรับปี พ.ศ. {selectedYear + 543} สามารถเพิ่มได้จากแบบฟอร์มด้านบน
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {holidays.map((h, i) => {
              const d = new Date(h.date);
              const dayOfWeek = d.toLocaleDateString("th-TH", { weekday: "long" });
              const dateThai = d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;

              return (
                <div
                  key={i}
                  className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-blue-300 hover:shadow-xs transition flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-center border shrink-0 ${
                      isWeekend
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : "bg-blue-50 border-blue-200 text-blue-700"
                    }`}>
                      <span className="text-[10px] uppercase">{d.toLocaleDateString("th-TH", { month: "short" })}</span>
                      <span className="text-base font-black leading-none">{d.getDate()}</span>
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-xs">{h.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{dayOfWeek} ({dateThai})</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDeleteHoliday(h.date)}
                    disabled={saving}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition opacity-60 group-hover:opacity-100"
                    title="ลบวันหยุด"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
