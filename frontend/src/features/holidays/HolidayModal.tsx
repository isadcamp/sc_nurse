"use client";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { CalendarDaysIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState, useEffect, useCallback } from "react";
import { request } from "@/lib/api";
import { HolidayCalendar } from "@/types/schedule";

interface HolidayModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
}

export function HolidayModal({ open, onClose, token }: HolidayModalProps) {
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
    if (open) {
      queueMicrotask(() => { void fetchHolidays(selectedYear); });
    }
  }, [open, selectedYear, fetchHolidays]);

  if (!open) return null;

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
    if (!confirm(`ต้องการคัดลอกวันหยุดจากปี ${selectedYear + 543} ไปยังปี ${nextYear + 543} ใช่หรือไม่?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await request("/holidays/copy-year", token, "POST", {
        sourceYear: selectedYear,
        destinationYear: nextYear,
      });
      setSuccess(`คัดลอกวันหยุดไปยังปี ${nextYear + 543} สำเร็จ`);
      setSelectedYear(nextYear);
    } catch (err) {
      setError(err instanceof Error ? err.message : "คัดลอกวันหยุดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame title="ปฏิทินวันหยุด" onClose={onClose}>
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-[92vw] md:w-[66.67vw] max-w-6xl h-[75vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <CalendarDaysIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                ปฏิทินวันหยุดนักขัตฤกษ์และประเพณี (Holiday Calendar)
              </h3>
              <p className="text-xs text-slate-400">
                จัดการวันหยุดประจำปีเพื่อใช้ในการคำนวณและวางแผนจัดตารางเวร
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="text-slate-400 hover:text-white transition p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar & Add Holiday Section */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700">เลือกปี พ.ศ.:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
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
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-xs cursor-pointer"
              title="คัดลอกวันหยุดทั้งหมดของปีนี้ไปยังปีถัดไป"
            >
              <span>📋</span> คัดลอกไปปี พ.ศ. {selectedYear + 543 + 1}
            </button>
          </div>

          {/* Add Holiday Form */}
          <form onSubmit={handleAddHoliday} className="pt-2 border-t border-slate-200/80">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
              <div className="sm:col-span-4">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  required
                />
              </div>
              <div className="sm:col-span-6">
                <input
                  type="text"
                  placeholder="ชื่อวันหยุด เช่น วันสงกรานต์, วันขึ้นปีใหม่"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  {saving ? "กำลังเพิ่ม..." : "+ เพิ่มวันหยุด"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-3 px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
            {error}
          </div>
        )}
        {success && (
          <div className="mx-6 mt-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold">
            {success}
          </div>
        )}

        {/* Holiday List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">กำลังโหลดข้อมูลวันหยุด...</div>
          ) : !calendar || calendar.holidays.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">ยังไม่มีวันหยุดที่บันทึกไว้สำหรับปีนี้</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 flex justify-between items-center font-medium">
                <span>รายการวันหยุดทั้งหมด <strong>{calendar.holidays.length} วัน</strong></span>
                <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md">
                  ปี พ.ศ. {selectedYear + 543}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {calendar.holidays.map((h, idx) => {
                  const datePart = h.date.split("T")[0];
                  const d = new Date(datePart);
                  const thaiDateStr = !isNaN(d.getTime())
                    ? d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", weekday: "short" })
                    : datePart;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 transition shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{h.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            📅 {thaiDateStr} <span className="text-slate-400 font-mono">({datePart})</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(datePart)}
                        disabled={saving}
                        className="text-xs px-2.5 py-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition font-bold cursor-pointer shrink-0 ml-2"
                      >
                        ลบ
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

