"use client";

import { useEffect, useState, useCallback } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { request } from "@/lib/api";
import type { UserAccount, UserRole, Ward } from "@/types/schedule";
import {
  UsersIcon,
  UserPlusIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  KeyIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldCheckIcon,
  BuildingOffice2Icon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface UserManagementModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  wards: Ward[];
}

const roleBadgeConfig: Record<UserRole, { label: string; bg: string; text: string; border: string }> = {
  admin: { label: "Super Admin", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  head: { label: "หัวหน้าเวร (Head Nurse)", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  nurse: { label: "พยาบาล (Staff Nurse)", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  viewer: { label: "ผู้ตรวจการ (Viewer)", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
};

export function UserManagementModal({ open, onClose, token, wards }: UserManagementModalProps) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Form mode: "list" | "create" | "edit" | "password"
  const [mode, setMode] = useState<"list" | "create" | "edit" | "password">("list");
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  // Create/Edit state
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("head");
  const [isActive, setIsActive] = useState(true);
  const [assignedWards, setAssignedWards] = useState<string[]>([]);

  // Password reset state
  const [newPassword, setNewPassword] = useState("");

  const loadUsers = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await request<{ data: UserAccount[] }>("/users", token);
      setUsers(res.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    if (open) {
      void loadUsers();
      setMode("list");
      setError("");
      setNotice("");
    }
  }, [open, loadUsers]);

  function handleStartCreate() {
    setSelectedUser(null);
    setUsername("");
    setDisplayName("");
    setEmail("");
    setPassword("");
    setRole("head");
    setIsActive(true);
    setAssignedWards(wards.length > 0 ? [wards[0].id] : []);
    setError("");
    setNotice("");
    setMode("create");
  }

  function handleStartEdit(u: UserAccount) {
    setSelectedUser(u);
    setUsername(u.username);
    setDisplayName(u.displayName);
    setEmail(u.email || "");
    setRole(u.role);
    setIsActive(u.isActive);
    setAssignedWards(u.wards || []);
    setError("");
    setNotice("");
    setMode("edit");
  }

  function handleStartPasswordReset(u: UserAccount) {
    setSelectedUser(u);
    setNewPassword("");
    setError("");
    setNotice("");
    setMode("password");
  }

  function toggleWard(wardId: string) {
    setAssignedWards((prev) =>
      prev.includes(wardId) ? prev.filter((w) => w !== wardId) : [...prev, wardId]
    );
  }

  async function handleSaveCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !displayName.trim() || !password.trim()) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/users", token, "POST", {
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        password: password.trim(),
        role,
        isActive,
        wards: assignedWards,
      });
      setNotice("สร้างผู้ใช้งานสำเร็จ");
      await loadUsers();
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างผู้ใช้งานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    setError("");
    try {
      await request(`/users/${selectedUser.id}`, token, "PUT", {
        displayName: displayName.trim(),
        email: email.trim(),
        role,
        isActive,
        wards: assignedWards,
      });
      setNotice("แก้ไขข้อมูลผู้ใช้สำเร็จ");
      await loadUsers();
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "แก้ไขข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser || !newPassword.trim()) {
      setError("กรุณากรอกรหัสผ่านใหม่");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request(`/users/${selectedUser.id}/password`, token, "PUT", {
        newPassword: newPassword.trim(),
      });
      setNotice(`รีเซ็ตรหัสผ่านของ ${selectedUser.displayName} สำเร็จ`);
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "รีเซ็ตรหัสผ่านไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStatus(u: UserAccount) {
    setBusy(true);
    setError("");
    try {
      await request(`/users/${u.id}/status`, token, "PATCH", {
        isActive: !u.isActive,
      });
      setNotice(`เปลี่ยนสถานะของ ${u.displayName} สำเร็จ`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUser(u: UserAccount) {
    if (!confirm(`คุณต้องการลบผู้ใช้ "${u.displayName} (${u.username})" หรือไม่?`)) return;
    setBusy(true);
    setError("");
    try {
      await request(`/users/${u.id}`, token, "DELETE");
      setNotice(`ลบผู้ใช้ ${u.displayName} สำเร็จ`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบผู้ใช้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    const matchQuery =
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchQuery && matchRole;
  });

  if (!open) return null;

  return (
    <ModalFrame title="การจัดการผู้ใช้งานระบบ" onClose={onClose}>
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <UsersIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">บริหารจัดการผู้ใช้งานระบบ (User Management)</h3>
              <p className="text-xs text-slate-400">จัดการบัญชีผู้ใช้งาน สิทธิ์การเข้าถึง และการกำหนดหน่วยงาน</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "list" && (
              <button
                type="button"
                onClick={handleStartCreate}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
              >
                <UserPlusIcon className="w-4 h-4" />
                <span>เพิ่มผู้ใช้ใหม่</span>
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
          <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <span>✅ {notice}</span>
            <button onClick={() => setNotice("")} className="text-emerald-600 hover:text-emerald-900">✕</button>
          </div>
        )}
        {error && (
          <div className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-xs font-semibold text-rose-800 flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900">✕</button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {mode === "list" && (
            <div className="space-y-4">
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อผู้ใช้, ชื่อ-นามสกุล..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">บทบาท:</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">ทั้งหมด (All Roles)</option>
                    <option value="admin">Super Admin</option>
                    <option value="head">หัวหน้าเวร (Head)</option>
                    <option value="nurse">พยาบาล (Nurse)</option>
                    <option value="viewer">ผู้ตรวจการ (Viewer)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void loadUsers()}
                    className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition"
                    title="โหลดข้อมูลใหม่"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-3 px-4">ชื่อผู้ใช้ (Username)</th>
                      <th className="py-3 px-4">ชื่อ-นามสกุล</th>
                      <th className="py-3 px-4">บทบาท (Role)</th>
                      <th className="py-3 px-4">แผนกที่ดูแล (Wards)</th>
                      <th className="py-3 px-4 text-center">สถานะ</th>
                      <th className="py-3 px-4 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          {busy ? "กำลังโหลดข้อมูล..." : "ไม่พบข้อมูลผู้ใช้งาน"}
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const rBadge = roleBadgeConfig[u.role] || roleBadgeConfig.viewer;
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3 px-4 font-mono font-bold text-slate-800">
                              {u.username}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-800">{u.displayName}</div>
                              {u.email && <div className="text-[10px] text-slate-400">{u.email}</div>}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold border ${rBadge.bg} ${rBadge.text} ${rBadge.border}`}>
                                {rBadge.label}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {u.role === "admin" ? (
                                <span className="text-[11px] text-purple-600 font-semibold">เข้าถึงได้ทุกแผนก</span>
                              ) : u.wards && u.wards.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {u.wards.map((wid) => (
                                    <span
                                      key={wid}
                                      className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-mono border border-slate-200"
                                    >
                                      {wid}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">- ยังไม่กำหนด -</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => void handleToggleStatus(u)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition ${
                                  u.isActive
                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                                }`}
                              >
                                {u.isActive ? (
                                  <>
                                    <CheckCircleIcon className="w-3.5 h-3.5" /> ใช้งานอยู่
                                  </>
                                ) : (
                                  <>
                                    <XCircleIcon className="w-3.5 h-3.5" /> ระงับใช้งาน
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartPasswordReset(u)}
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                  title="รีเซ็ตรหัสผ่าน"
                                >
                                  <KeyIcon className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(u)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="แก้ไขข้อมูล"
                                >
                                  <PencilSquareIcon className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteUser(u)}
                                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title="ลบผู้ใช้"
                                >
                                  <TrashIcon className="w-4 h-4" />
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
          )}

          {(mode === "create" || mode === "edit") && (
            <form onSubmit={mode === "create" ? handleSaveCreate : handleSaveEdit} className="space-y-4 max-w-xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="text-sm font-bold text-slate-800">
                  {mode === "create" ? "เพิ่มผู้ใช้งานใหม่ (New User)" : `แก้ไขข้อมูลผู้ใช้: ${username}`}
                </h4>
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
                >
                  ← กลับไปหน้ารายการ
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อผู้ใช้ (Username) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={mode === "edit"}
                    placeholder="เช่น nurse_somchai"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อ-นามสกุล / ชื่อที่แสดง <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น พว.สมชาย ใจดี"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {mode === "create" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสผ่าน (Password) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="ความยาวอย่างน้อย 4 ตัวอักษร"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    อีเมล (Email)
                  </label>
                  <input
                    type="email"
                    placeholder="somchai@hospital.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    บทบาทการทำงาน (Role) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="head">หัวหน้าเวร / จัดเวร (Head Nurse)</option>
                    <option value="nurse">พยาบาลทั่วไป (Staff Nurse)</option>
                    <option value="viewer">ผู้ตรวจการ / ดูอย่างเดียว (Viewer)</option>
                    <option value="admin">ผู้ดูแลระบบสูงสุด (Super Admin)</option>
                  </select>
                </div>
              </div>

              {/* Wards assignment */}
              {role !== "admin" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    แผนก/หน่วยงานที่รับผิดชอบ (Assigned Wards)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-36 overflow-y-auto">
                    {wards.map((w) => {
                      const checked = assignedWards.includes(w.id);
                      return (
                        <label
                          key={w.id}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition border ${
                            checked
                              ? "bg-blue-50/80 border-blue-200 text-blue-900 font-semibold"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleWard(w.id)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span className="truncate">{w.name} ({w.id})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActiveToggle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  เปิดใช้งานบัญชีนี้ (Active Account)
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
                  {busy ? "กำลังบันทึก..." : mode === "create" ? "สร้างผู้ใช้" : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          )}

          {mode === "password" && selectedUser && (
            <form onSubmit={handleSavePassword} className="space-y-4 max-w-md mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
                  <KeyIcon className="w-5 h-5" />
                  <span>รีเซ็ตรหัสผ่าน</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
                >
                  ← กลับ
                </button>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                กำลังเปลี่ยนรหัสผ่านสำหรับผู้ใช้: <strong>{selectedUser.displayName} ({selectedUser.username})</strong>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัสผ่านใหม่ (New Password) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="ความยาวอย่างน้อย 4 ตัวอักษร"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
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
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-amber-600/20 disabled:opacity-50"
                >
                  {busy ? "กำลังบันทึก..." : "ยืนยันการเปลี่ยนรหัสผ่าน"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
