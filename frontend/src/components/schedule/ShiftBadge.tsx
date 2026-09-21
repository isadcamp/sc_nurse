"use client";
import React from "react";
import { LockClosedIcon } from "@heroicons/react/16/solid";

interface ShiftBadgeProps {
  shiftCode: string;
  locked?: boolean;
  isWarning?: boolean;
  isError?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  size?: "sm" | "md" | "lg";
}

export const SHIFT_CONFIGS: Record<string, { label: string; name: string; bg: string; text: string; border: string; icon: string }> = {
  "ช": { label: "ช", name: "เช้า (07:00-15:00)", bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-200", icon: "🌅" },
  "บ": { label: "บ", name: "บ่าย (15:00-23:00)", bg: "bg-yellow-100", text: "text-yellow-950", border: "border-yellow-300", icon: "🌇" },
  "ด": { label: "ด", name: "ดึก (23:00-07:00)", bg: "bg-slate-200", text: "text-slate-900", border: "border-slate-400", icon: "🌙" },
  "ชบ": { label: "ชบ", name: "เช้า-บ่าย (16 ชม.)", bg: "bg-teal-100", text: "text-teal-900", border: "border-teal-300", icon: "⚡" },
  "ชด": { label: "ชด", name: "เช้า-ดึก (16 ชม.)", bg: "bg-[#efdfcc]", text: "text-[#593b20]", border: "border-[#c6a680]", icon: "⚡" },
  "บด": { label: "บด", name: "บ่าย-ดึก (16 ชม.)", bg: "bg-orange-100", text: "text-orange-950", border: "border-orange-300", icon: "⚡" },
  "D": { label: "D", name: "กลางวัน (12 ชม.)", bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-300", icon: "☀️" },
  "Day": { label: "D", name: "กลางวัน (12 ชม.)", bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-300", icon: "☀️" },
  "N": { label: "N", name: "กลางคืน (12 ชม.)", bg: "bg-violet-100", text: "text-violet-950", border: "border-violet-300", icon: "🌃" },
  "Night": { label: "N", name: "กลางคืน (12 ชม.)", bg: "bg-violet-100", text: "text-violet-950", border: "border-violet-300", icon: "🌃" },
  "x": { label: "x", name: "วันหยุด (Off)", bg: "bg-white", text: "text-slate-600", border: "border-slate-300 border-dashed", icon: "🟢" },
  "X": { label: "x", name: "วันหยุด (Off)", bg: "bg-white", text: "text-slate-600", border: "border-slate-300 border-dashed", icon: "🟢" },
  "อ": { label: "x", name: "วันหยุด (Off)", bg: "bg-white", text: "text-slate-600", border: "border-slate-300 border-dashed", icon: "🟢" },
  "L": { label: "L", name: "วันลา (Leave)", bg: "bg-pink-100", text: "text-pink-950", border: "border-pink-300", icon: "🏖️" },
  "Va": { label: "Va", name: "ลาพักผ่อน (Vacation)", bg: "bg-rose-100", text: "text-rose-950", border: "border-rose-300", icon: "🏖️" },
  "V": { label: "V", name: "ลาพักร้อน (8 ชม.)", bg: "bg-rose-100", text: "text-rose-950", border: "border-rose-300", icon: "🌴" },
  "v": { label: "V", name: "ลาพักร้อน (8 ชม.)", bg: "bg-rose-100", text: "text-rose-950", border: "border-rose-300", icon: "🌴" },
  "อบ": { label: "อบ", name: "อบรม/ประชุมวิชาการ (8 ชม.)", bg: "bg-indigo-100", text: "text-indigo-950", border: "border-indigo-300", icon: "🎓" },
  "บห": { label: "บห", name: "งานบริหาร/ภารกิจพิเศษ (8 ชม.)", bg: "bg-cyan-100", text: "text-cyan-950", border: "border-cyan-300", icon: "💼" },
};

export function ShiftBadge({
  shiftCode,
  locked = false,
  isWarning = false,
  isError = false,
  className = "",
  onClick,
  size = "md",
}: ShiftBadgeProps) {
  const code = shiftCode?.trim() || "";
  const conf = SHIFT_CONFIGS[code] ?? {
    label: code || "-",
    name: code || "ว่าง",
    bg: code ? "bg-blue-50" : "bg-transparent",
    text: code ? "text-blue-900" : "text-slate-400",
    border: code ? "border-blue-200" : "border-transparent",
    icon: "",
  };

  const sizeCls = size === "sm" ? "px-1.5 py-0.5 text-sm min-w-[28px]" : size === "lg" ? "px-3 py-1.5 text-sm min-w-[48px]" : "px-1.5 py-1 text-sm min-w-[30px]";

  let alertRing = "";
  if (isError) {
    alertRing = "ring-2 ring-rose-500 font-bold";
  } else if (isWarning) {
    alertRing = "ring-2 ring-amber-400";
  }

  return (
    <div
      onClick={onClick}
      title={`${conf.name}${locked ? " (ล็อกเวร 🔒)" : ""}`}
      className={`inline-flex items-center justify-center font-bold rounded-md border transition-colors select-none ${conf.bg} ${conf.text} ${conf.border} ${sizeCls} ${alertRing} ${className}`}
    >
      <span>{conf.label}</span>
      {(isError || isWarning) && <span className="ml-1" aria-label={isError ? "มีข้อผิดพลาด" : "มีข้อควรตรวจสอบ"}>!</span>}
      {locked && (
        <span className="ml-1 text-[10px] leading-none" title="เวรนี้ถูกล็อก">
          <LockClosedIcon className="h-3 w-3"/>
        </span>
      )}
    </div>
  );
}
