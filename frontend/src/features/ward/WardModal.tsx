"use client";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { BuildingOffice2Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { request } from "@/lib/api";

interface WardModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (wardId: string) => void;
  token: string;
}

export function WardModal({ open, onClose, onCreated, token }: WardModalProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Bangkok");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      setError("กรุณากรอกรหัสและชื่อหน่วยงาน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/wards", token, "POST", { id: id.trim(), name: name.trim(), timezone: timezone.trim() });
      onCreated(id.trim());
      setId("");
      setName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างหน่วยงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalFrame title="สร้างหน่วยงาน" onClose={onClose}>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BuildingOffice2Icon className="h-7 w-7 text-blue-600" aria-hidden="true"/>
            <div>
              <h3 className="text-base font-bold text-slate-800">เพิ่มหน่วยงานใหม่ (New Ward)</h3>
              <p className="text-xs text-slate-500">สร้างหอผู้ป่วยหรือแผนกใหม่ในระบบ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="text-slate-400 hover:text-slate-600 transition text-xl leading-none"
          >
            <XMarkIcon className="h-5 w-5"/>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              รหัสหน่วยงาน (Ward ID) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. ward-er, ward-or, ward-ped"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ชื่อหน่วยงาน (Ward Name) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. แผนกอุบัติเหตุและฉุกเฉิน (ER)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-blue-600/20"
            >
              {busy ? "กำลังสร้าง..." : "สร้างหน่วยงาน"}
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
