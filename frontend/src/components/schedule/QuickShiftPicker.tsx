"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { XMarkIcon, LockClosedIcon, LockOpenIcon, BackspaceIcon } from "@heroicons/react/24/outline";
import { shiftFamily } from "./shiftOptions";
import { ShiftBadge, SHIFT_CONFIGS } from "./ShiftBadge";

interface QuickShiftPickerProps {
  nurseName?: string;
  shiftOptions?: {code: string; name: string; periods: {start: number; end: number}[]}[];
  currentShift: string;
  isLocked: boolean;
  canLock?: boolean;
  shiftCodes?: string[];
  date?: string;
  shiftQuotas?: Record<string, { actual: number; target: number }>;
  position: { top: number; left: number };
  onSelectShift: (code: string) => void;
  onToggleLock: () => void;
  onClose: () => void;
}
export function QuickShiftPicker({
  nurseName,
  shiftOptions,
  currentShift,
  isLocked,
  canLock = true,
  shiftCodes = ["ช", "บ", "ด", "ชบ", "D", "N", "x", "L", "V"],
  date,
  shiftQuotas,
  position,
  onSelectShift,
  onToggleLock,
  onClose,
}: QuickShiftPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const codes = shiftCodes.filter((code) => code !== "");
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(position.left, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(position.top, window.innerHeight - rect.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button")?.focus();
  }, [position.top, position.left]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="เลือกเวร"
      className="nf-shift-picker w-[min(360px,calc(100vw-16px))] max-h-[calc(100dvh-16px)] overflow-y-auto shadow-2xl z-50"
      style={{ top: position.top, left: position.left }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        const shortcut: Record<string, string> = { "1": "ช", "2": "บ", "3": "ด", "0": codes.includes("x") ? "x" : codes.includes("X") ? "X" : "อ", l: "L", L: "L", v: "V", V: "V", d: "D", n: "N" };
        const selectedCode = codes.find(code => shiftFamily(code) === shortcut[event.key]);
        if (!isLocked && selectedCode) {
          event.preventDefault();
          onSelectShift(selectedCode);
        }
      }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div>
          <strong className="text-sm text-slate-800">เลือกเวร {nurseName}</strong>
          {date && <span className="ml-2 text-xs font-semibold text-slate-500">{date}</span>}
        </div>
        <button className="nf-icon-button" aria-label="ปิดตัวเลือกเวร" onClick={onClose}>
          <XMarkIcon />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 py-3">
        {Array.from(new Set(codes.filter(c => Boolean(c && c !== "?" && c !== "??" && c !== "???")))).map((code, cIdx) => {
          const wasCovering = (periodKey: string) => {
            if (periodKey === "morning") return currentShift === "ช" || currentShift === "Day" || currentShift === "D" || currentShift === "ชบ";
            if (periodKey === "afternoon") return currentShift === "บ" || currentShift === "ชบ" || currentShift === "Day" || currentShift === "D" || currentShift === "บด";
            if (periodKey === "night") return currentShift === "ด" || currentShift === "Night" || currentShift === "N" || currentShift === "บด";
            return false;
          };
          const willCover = (periodKey: string) => {
            if (periodKey === "morning") return code === "ช" || code === "Day" || code === "D" || code === "ชบ";
            if (periodKey === "afternoon") return code === "บ" || code === "ชบ" || code === "Day" || code === "D" || code === "บด";
            if (periodKey === "night") return code === "ด" || code === "Night" || code === "N" || code === "บด";
            return false;
          };
          const isAdding = (periodKey: string) => willCover(periodKey) && !wasCovering(periodKey);

          const quota = shiftQuotas?.[code];
          let isFull = false;
          if (isAdding("morning") && shiftQuotas?.["ช"] && shiftQuotas["ช"].target > 0 && shiftQuotas["ช"].actual >= shiftQuotas["ช"].target) {
            isFull = true;
          }
          if (isAdding("afternoon") && shiftQuotas?.["บ"] && shiftQuotas["บ"].target > 0 && shiftQuotas["บ"].actual >= shiftQuotas["บ"].target) {
            isFull = true;
          }
          if (isAdding("night") && shiftQuotas?.["ด"] && shiftQuotas["ด"].target > 0 && shiftQuotas["ด"].actual >= shiftQuotas["ด"].target) {
            isFull = true;
          }
          const isOver = quota && quota.target > 0 && quota.actual > quota.target;

          return (
            <button
              type="button"
              disabled={isLocked || isFull}
              key={`${code}_${cIdx}`}
              aria-label={`เลือกเวร ${code}`}
              aria-pressed={currentShift === code}
              title={
                quota
                  ? `${SHIFT_CONFIGS[code]?.name || code}: จัดแล้ว ${quota.actual}/${quota.target} คน${
                      isFull ? " (🚫 เต็มโควตาแล้ว - ห้ามจัดเพิ่มเพื่อคุมค่า OT)" : ""
                    }`
                  : SHIFT_CONFIGS[code]?.name || code
              }
              className={`min-h-12 rounded-xl p-1.5 flex flex-col items-center justify-center relative transition ${
                currentShift === code
                  ? "bg-blue-50 ring-2 ring-blue-500"
                  : isFull
                  ? "bg-slate-100 opacity-60 cursor-not-allowed border border-slate-200"
                  : "hover:bg-slate-100 border border-transparent"
              }`}
              onClick={() => {
                if (!isFull) {
                  onSelectShift(code);
                }
              }}
            >
              <ShiftBadge shiftCode={code} />
              <span className="mt-1 text-sm">{shiftOptions?.find(s => s.code === code)?.name || SHIFT_CONFIGS[code]?.name.split(" (")[0] || code}</span>
              {shiftOptions && shiftOptions.filter(s => shiftFamily(s.code) === shiftFamily(code)).length > 1 && <span className="text-xs">{shiftOptions.find(s => s.code === code)?.periods.map(p => `${Math.floor(p.start / 60) % 24}:${String(p.start % 60).padStart(2, "0")}–${Math.floor(p.end / 60) % 24}:${String(p.end % 60).padStart(2, "0")}`).join(", ")}</span>}
              {quota && quota.target > 0 && (
                <div
                  className={`mt-1 text-[9px] font-bold px-1 rounded leading-tight ${
                    isOver
                      ? "bg-purple-200 text-purple-900"
                      : isFull
                      ? "bg-rose-100 text-rose-800"
                      : quota.actual === quota.target
                      ? "bg-emerald-100 text-emerald-800"
                      : "text-slate-500"
                  }`}
                >
                  {quota.actual}/{quota.target}
                  {isFull && " (เต็ม)"}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {isLocked && <p className="text-xs text-amber-800">เวรนี้ถูกล็อก กรุณาปลดล็อกก่อนแก้ไข</p>}
      <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3">
        <button disabled={isLocked} className="nf-button" onClick={() => onSelectShift("")}>
          <BackspaceIcon />
          ล้างเวร
        </button>
        <button disabled={!canLock} className="nf-button" onClick={onToggleLock}>
          {isLocked ? <LockOpenIcon /> : <LockClosedIcon />}
          {isLocked ? "ปลดล็อก" : "ล็อกเวร"}
        </button>
      </div>
      {!canLock && <p className="mt-2 text-xs text-slate-500">บันทึกเวรก่อนล็อกช่องนี้</p>}
    </div>
  );
}
