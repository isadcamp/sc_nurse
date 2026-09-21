"use client";

import { useEffect, useState, useCallback } from "react";
import { request } from "@/lib/api";
import type { UserAccount, UserRole, Ward } from "@/types/schedule";
import {
  UsersIcon,
  UserPlusIcon,
  MagnifyingGlassIcon,
  KeyIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldCheckIcon,
  BuildingOffice2Icon,
  ArrowPathIcon,
  ArrowLeftIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";

interface UserManagementPanelProps {
  token: string;
  wards: Ward[];
  onBackToGrid?: () => void;
}

const roleBadgeConfig: Record<UserRole, { label: string; bg: string; text: string; border: string }> = {
  admin: { label: "Super Admin", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  head: { label: "หัวหน้าเวร (Head Nurse)", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  nurse: { label: "พยาบาล (Staff Nurse)", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  viewer: { label: "ผู้ตรวจการ (Viewer)", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
};

export function UserManagementPanel({ token, wards, onBackToGrid }: UserManagementPanelProps) {
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
    void loadUsers();
    setMode("list");
    setError("");
    setNotice("");
  }, [loadUsers]);

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner / Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBackToGrid && (
            <button
              type="button"
              onClick={onBackToGrid}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span>← กลับสู่ตารางเวร</span>
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 font-bold">
            <UsersIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              บริหารจัดการผู้ใช้งานระบบ (User Management)
            </h2>
            <p className="text-xs text-slate-500">
              จัดการบัญชีผู้ใช้งาน สิทธิ์การเข้าถึง และการกำหนดหน่วยงานที่รับผิดชอบ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === "list" ? (
            <button
              type="button"
              onClick={handleStartCreate}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
            >
              <UserPlusIcon className="w-4 h-4" />
              <span>เพิ่มผู้ใช้ใหม่</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode("list")}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              ← กลับไปหน้ารายชื่อผู้ใช้
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={busy}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition"
            title="รีเฟรชข้อมูล"
          >
            <ArrowPathIcon className={`w-4 h-4 ${busy ? "animate-spin text-purple-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notice & Error */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckBadgeIcon className="w-5 h-5 text-emerald-600" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice("")} className="text-emerald-600 hover:text-emerald-900 font-bold px-1">✕</button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircleIcon className="w-5 h-5 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-900 font-bold px-1">✕</button>
        </div>
      )}

      {/* Main Content Area */}
      {mode === "list" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          {/* Search & Filter Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
              <div className="relative w-full">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อผู้ใช้, ชื่อ-นามสกุล หรืออีเมล..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">บทบาท:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              >
                <option value="all">ทั้งหมด (All Roles)</option>
                <option value="admin">Super Admin</option>
                <option value="head">หัวหน้าเวร (Head)</option>
                <option value="nurse">พยาบาล (Nurse)</option>
                <option value="viewer">ผู้ตรวจการ (Viewer)</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">ชื่อผู้ใช้ (Username)</th>
                  <th className="py-3 px-4">ชื่อ-นามสกุล</th>
                  <th className="py-3 px-4">บทบาท (Role)</th>
                  <th className="py-3 px-4">แผนกที่ดูแล (Wards)</th>
                  <th className="py-3 px-4 text-center">สถานะ</th>
                  <th className="py-3 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <UsersIcon className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold">{busy ? "กำลังโหลดข้อมูล..." : "ไม่พบข้อมูลผู้ใช้งาน"}</p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, uIdx) => {
                    const rBadge = roleBadgeConfig[u.role] || roleBadgeConfig.viewer;
                    return (
                      <tr key={`${u.id || "user"}_${uIdx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {u.username}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{u.displayName}</div>
                          {u.email && <div className="text-[10px] text-slate-400">{u.email}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${rBadge.bg} ${rBadge.text} ${rBadge.border}`}>
                            {rBadge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {u.role === "admin" ? (
                            <span className="text-[11px] text-purple-600 font-bold flex items-center gap-1">
                              <ShieldCheckIcon className="w-3.5 h-3.5" /> เข้าถึงได้ทุกแผนก
                            </span>
                          ) : u.wards && u.wards.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.wards.map((wid, wIdx) => (
                                <span
                                  key={`${wid}_${wIdx}`}
                                  className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-mono font-bold border border-slate-200"
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
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                              u.isActive
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
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
        <form onSubmit={mode === "create" ? handleSaveCreate : handleSaveEdit} className="space-y-4 max-w-xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h4 className="text-sm font-bold text-slate-800">
              {mode === "create" ? "เพิ่มผู้ใช้งานใหม่ (New User)" : `แก้ไขข้อมูลผู้ใช้: ${username}`}
            </h4>
            <button
              type="button"
              onClick={() => setMode("list")}
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              ← กลับไปหน้ารายชื่อ
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ชื่อผู้ใช้ (Username) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                disabled={mode === "edit"}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="เช่น nurse01"
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ชื่อ-นามสกุล (Display Name) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="เช่น พว.สมศรี รักดี"
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                อีเมล (Email)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nurse@hospital.go.th"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                บทบาท (Role) <span className="text-rose-500">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              >
                <option value="head">หัวหน้าเวร (Head Nurse)</option>
                <option value="nurse">พยาบาล (Staff Nurse)</option>
                <option value="admin">Super Admin</option>
                <option value="viewer">ผู้ตรวจการ (Viewer)</option>
              </select>
            </div>
          </div>

          {mode === "create" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                รหัสผ่านเริ่มต้น (Initial Password) <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ตั้งรหัสผ่านสำหรับเข้าสู่ระบบ"
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>
          )}

          {role !== "admin" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                กำหนดแผนกที่ดูแล / สังกัด
              </label>
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-36 overflow-y-auto">
                {wards.map((w) => {
                  const isChecked = assignedWards.includes(w.id);
                  return (
                    <button
                      type="button"
                      key={w.id}
                      onClick={() => toggleWard(w.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        isChecked
                          ? "bg-purple-100 text-purple-800 border-purple-300 shadow-2xs"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {isChecked ? "✓ " : ""}{w.name} ({w.id})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("list")}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            >
              {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : null}
              <span>{mode === "create" ? "สร้างผู้ใช้งาน" : "บันทึกการแก้ไข"}</span>
            </button>
          </div>
        </form>
      )}

      {mode === "password" && selectedUser && (
        <form onSubmit={handleSavePassword} className="space-y-4 max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <KeyIcon className="w-4 h-4 text-amber-600" />
              <span>รีเซ็ตรหัสผ่าน: {selectedUser.displayName}</span>
            </h4>
            <button
              type="button"
              onClick={() => setMode("list")}
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              ← กลับไปหน้ารายชื่อ
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              รหัสผ่านใหม่ (New Password) <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="ระบุรหัสผ่านใหม่"
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("list")}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            >
              {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : null}
              <span>ยืนยันเปลี่ยนรหัสผ่าน</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
