"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { request } from "@/lib/api";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  PrinterIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  BuildingOffice2Icon,
  ArrowPathIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

export interface ScheduleYearSummary {
  id: number;
  wardId: string;
  month: number;
  year: number;
  status: string;
  version: number;
  publishedBy?: string;
  publishedAt?: string;
}

interface AnnualOverviewPanelProps {
  wardId: string;
  wardName: string;
  token: string;
  isHead: boolean;
  onOpenSchedule: (monthStr: string, scheduleId?: number) => void;
  onStartSchedule: (monthStr: string) => void;
  onCreateBlankSchedule: (monthStr: string) => Promise<void>;
  onPrintSchedule: (monthStr: string, scheduleId: number) => void;
  onUnpublish: (scheduleId: number) => void;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function AnnualOverviewPanel({
  wardId,
  wardName,
  token,
  isHead,
  onOpenSchedule,
  onStartSchedule,
  onCreateBlankSchedule,
  onPrintSchedule,
  onUnpublish,
}: AnnualOverviewPanelProps) {
  const currentRealDate = useMemo(() => new Date(), []);
  const currentRealYear = currentRealDate.getFullYear();
  const currentRealMonth = currentRealDate.getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState<number>(currentRealYear);
  const [schedules, setSchedules] = useState<ScheduleYearSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creatingMonth, setCreatingMonth] = useState<string | null>(null);

  const loadYearSchedules = useCallback(async (year: number) => {
    if (!token || !wardId) return;
    setLoading(true);
    setError("");
    try {
      const monthlyResults = await Promise.all(
        Array.from({ length: 12 }, async (_, index) => {
          const month = index + 1;
          const data = await request<{ data: ScheduleYearSummary[] }>(
            `/wards/${encodeURIComponent(wardId)}/schedules?month=${month}&year=${year}`,
            token
          );
          return data.data || [];
        })
      );
      setSchedules(monthlyResults.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลตารางเวร");
    } finally {
      setLoading(false);
    }
  }, [token, wardId]);

  useEffect(() => {
    queueMicrotask(() => { void loadYearSchedules(selectedYear); });
  }, [selectedYear, loadYearSchedules]);

  // Compute month stats
  const monthsData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const monthSchedules = schedules.filter((s) => s.month === monthNum && s.year === selectedYear);
      
      // Sort: published first, then highest version, then highest id
      monthSchedules.sort((a, b) => {
        if (a.status === "published" && b.status !== "published") return -1;
        if (b.status === "published" && a.status !== "published") return 1;
        return b.version - a.version || b.id - a.id;
      });

      const published = monthSchedules.find((s) => s.status === "published");
      const closed = monthSchedules.find((s) => s.status === "closed");
      const approved = monthSchedules.find((s) => s.status === "approved");
      const underReview = monthSchedules.find((s) => s.status === "under_review");
      const latestDraft = monthSchedules.find((s) => s.status === "draft" || s.status === "generated");

      const mainSchedule = published || closed || approved || underReview || latestDraft || monthSchedules[0];

      const isCurrentMonth = selectedYear === currentRealYear && monthNum === currentRealMonth;
      const monthCode = `${selectedYear}-${String(monthNum).padStart(2, "0")}`;

      return {
        monthNum,
        monthName: THAI_MONTHS[i],
        monthCode,
        isCurrentMonth,
        schedules: monthSchedules,
        publishedSchedule: published,
        mainSchedule,
        hasPublished: !!published,
        hasDraft: Boolean((approved || underReview || latestDraft) && !published && !closed),
        isEmpty: monthSchedules.length === 0,
        isClosed: !!closed && !published,
      };
    });
  }, [schedules, selectedYear, currentRealYear, currentRealMonth]);

  // KPI Metrics
  const publishedCount = monthsData.filter((m) => m.hasPublished).length;
  const inProgressCount = monthsData.filter((m) => m.hasDraft).length;
  const emptyCount = monthsData.filter((m) => m.isEmpty).length;
  const closedCount = monthsData.filter((m) => m.isClosed).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
              <BuildingOffice2Icon className="w-3.5 h-3.5" />
              {wardName}
            </span>
            <span className="text-xs text-slate-500 font-semibold">ภาพรวมการจัดเวรรายปี</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarDaysIcon className="w-7 h-7 text-blue-600 shrink-0" />
            <span>ปฏิทินและสถานะตารางเวร 12 เดือน</span>
          </h2>
        </div>

        {/* Year Switcher Controls */}
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
          <button
            type="button"
            onClick={() => setSelectedYear((y) => y - 1)}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-blue-700 hover:bg-white rounded-xl transition cursor-pointer disabled:opacity-50"
            title="ปีก่อนหน้า"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div className="px-4 py-1 text-center min-w-[120px]">
            <div className="text-sm font-extrabold text-blue-950">
              พ.ศ. {selectedYear + 543}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              (ค.ศ. {selectedYear})
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedYear((y) => y + 1)}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-blue-700 hover:bg-white rounded-xl transition cursor-pointer disabled:opacity-50"
            title="ปีถัดไป"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => void loadYearSchedules(selectedYear)}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-white rounded-xl transition cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/30 border border-emerald-200 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
            <span className="flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 text-emerald-600" /> ประกาศใช้แล้ว
            </span>
            <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded font-black">
              {Math.round((publishedCount / 12) * 100)}%
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-950">
            {publishedCount} <span className="text-xs font-semibold text-emerald-700">/ 12 เดือน</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50/30 border border-amber-200 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
            <ClockIcon className="w-4 h-4 text-amber-600" /> กำลังจัดทำ / รอตรวจ
          </div>
          <div className="text-2xl font-black text-amber-950">
            {inProgressCount} <span className="text-xs font-semibold text-amber-700">เดือน</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-50 to-slate-100/40 border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <DocumentTextIcon className="w-4 h-4 text-slate-400" /> ยังไม่เริ่มสร้าง
          </div>
          <div className="text-2xl font-black text-slate-800">
            {emptyCount} <span className="text-xs font-semibold text-slate-500">เดือน</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-indigo-50/30 border border-purple-200 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="text-xs font-bold text-purple-800 flex items-center gap-1.5">
            <span>🔒</span> ปิดงวดบัญชีแล้ว
          </div>
          <div className="text-2xl font-black text-purple-950">
            {closedCount} <span className="text-xs font-semibold text-purple-700">เดือน</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 12 MONTHS BOARD GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
        {monthsData.map((m) => {
          const published = m.publishedSchedule;
          const isPublished = !!published;
          const main = m.mainSchedule;

          return (
            <div
              key={m.monthNum}
              className={`rounded-3xl border-2 p-5 flex flex-col justify-between transition-all duration-200 relative overflow-hidden ${
                isPublished
                  ? "border-emerald-400 bg-gradient-to-br from-emerald-50/90 via-teal-50/30 to-white shadow-xs hover:shadow-md hover:border-emerald-500"
                  : m.hasDraft
                  ? "border-amber-300 bg-gradient-to-br from-amber-50/70 via-orange-50/20 to-white shadow-xs hover:shadow-md hover:border-amber-400"
                  : m.isClosed
                  ? "border-slate-300 bg-slate-100/90"
                  : "border-dashed border-slate-300 bg-slate-50/70 hover:bg-white hover:border-blue-400"
              }`}
            >
              {/* Top Row: Month Name & Today Flag */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-400 w-5">
                      {String(m.monthNum).padStart(2, "0")}
                    </span>
                    <h3 className="font-extrabold text-base text-slate-900">
                      {m.monthName} {selectedYear + 543}
                    </h3>
                  </div>
                  {m.isCurrentMonth && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white shadow-xs animate-pulse">
                      📍 เดือนนี้
                    </span>
                  )}
                </div>

                {/* Status Badge & Details */}
                {published ? (
                  <div className="space-y-2 py-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span>✓</span>
                      <span>📢 ประกาศใช้แล้ว (v{published.version})</span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>
                        ผู้ประกาศ: <strong className="text-slate-800">{published.publishedBy || "หัวหน้าตึก"}</strong>
                      </p>
                      {published.publishedAt && (
                        <p className="text-[11px] text-slate-500">
                          เมื่อ {new Date(published.publishedAt).toLocaleDateString("th-TH", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                      <p className="text-[11px] text-emerald-700 font-semibold">
                        ตารางฉบับทางการ #{published.id}
                        {m.schedules.length > 1 && ` (มีรวม ${m.schedules.length} เวอร์ชัน)`}
                      </p>
                    </div>
                  </div>
                ) : m.hasDraft && main ? (
                  <div className="space-y-2 py-1">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${
                      main.status === "under_review"
                        ? "bg-amber-100 text-amber-900 border border-amber-300"
                        : main.status === "approved"
                        ? "bg-teal-100 text-teal-900 border border-teal-300"
                        : "bg-blue-100 text-blue-900 border border-blue-300"
                    }`}>
                      <span>{main.status === "under_review" ? "⏳" : main.status === "approved" ? "✅" : "📝"}</span>
                      <span>
                        {main.status === "under_review"
                          ? "รอตรวจ/อนุมัติ"
                          : main.status === "approved"
                          ? "อนุมัติแล้ว (รอประกาศ)"
                          : `แบบร่าง (Draft v${main.version})`}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p className="text-[11px]">
                        เวอร์ชันล่าสุด: <strong>#{main.id} (v{main.version})</strong>
                      </p>
                      <p className="text-[11px] text-amber-800 font-medium">
                        โควตา: {m.schedules.length} / 12 Drafts
                      </p>
                    </div>
                  </div>
                ) : m.isClosed && main ? (
                  <div className="space-y-2 py-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-200 text-slate-800 border border-slate-300">
                      <span>🔒</span> ปิดงวดบัญชีแล้ว (#{main.id})
                    </span>
                    <p className="text-[11px] text-slate-500">ใช้สำหรับตรวจสอบข้อมูลย้อนหลัง</p>
                  </div>
                ) : (
                  <div className="py-4 text-center space-y-1">
                    <div className="text-xs font-bold text-slate-400">⚪ ยังไม่มีตารางเวร</div>
                    <p className="text-[11px] text-slate-400">ยังไม่ได้เริ่มเตรียมข้อมูลหรือจัดเวร</p>
                  </div>
                )}
              </div>

              {/* Bottom Action Buttons */}
              <div className="pt-3 mt-3 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
                {published ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenSchedule(m.monthCode, published.id)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer"
                      >
                        <CalendarDaysIcon className="w-3.5 h-3.5" />
                        <span>ดูตารางเวร</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPrintSchedule(m.monthCode, published.id)}
                        className="p-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold transition shadow-2xs cursor-pointer"
                        title="พิมพ์ A4"
                      >
                        <PrinterIcon className="w-4 h-4" />
                      </button>
                    </div>
                    {isHead && (
                      <button
                        type="button"
                        onClick={() => onUnpublish(published.id)}
                        className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-semibold transition cursor-pointer"
                        title="ขอยกเลิกการประกาศใช้"
                      >
                        <ExclamationTriangleIcon className="w-4 h-4" />
                      </button>
                    )}
                  </>
                ) : m.hasDraft && main ? (
                  <button
                    type="button"
                    onClick={() => onOpenSchedule(m.monthCode, main.id)}
                    className="w-full py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <SparklesIcon className="w-3.5 h-3.5" />
                    <span>{main.status === "under_review" ? "ตรวจเพื่ออนุมัติ" : "จัดเวรต่อ / ปรับแต่ง"}</span>
                  </button>
                ) : m.isClosed && main ? (
                  <button
                    type="button"
                    onClick={() => onOpenSchedule(m.monthCode, main.id)}
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>ดูข้อมูลย้อนหลัง</span>
                  </button>
                ) : (
                  isHead ? (
                    <button
                      type="button"
                      disabled={creatingMonth === m.monthCode}
                      onClick={async () => {
                        setCreatingMonth(m.monthCode);
                        try {
                          await onCreateBlankSchedule(m.monthCode);
                          await loadYearSchedules(selectedYear);
                        } finally {
                          setCreatingMonth(null);
                        }
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 hover:border-blue-600 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-60 disabled:cursor-wait"
                    >
                      {creatingMonth === m.monthCode ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      <span>{creatingMonth === m.monthCode ? "กำลังสร้างตารางเปล่า..." : "สร้างตารางเปล่า"}</span>
                    </button>
                  ) : (
                    <span className="w-full py-2 px-3 text-center text-xs font-semibold text-slate-400">รอหัวหน้าสร้างตาราง</span>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


