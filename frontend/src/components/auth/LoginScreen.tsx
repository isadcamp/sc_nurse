"use client";

import { useState } from "react";
import { request } from "@/lib/api";
import {
  LockClosedIcon,
  UserIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  SparklesIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

interface LoginScreenProps {
  onLoginSuccess: (token: string, actor: { id: string; role: string; displayName?: string; wards?: string[] }) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [mode, setMode] = useState<"account" | "token">("account");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleAccountLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const res = await request<{
        token: string;
        user: {
          id: number;
          username: string;
          displayName: string;
          role: string;
          wards: string[];
        };
      }>("/auth/login", "", "POST", {
        username: username.trim(),
        password: password.trim(),
      });

      onLoginSuccess(res.token, {
        id: res.user.username,
        role: res.user.role,
        displayName: res.user.displayName,
        wards: res.user.wards,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    } finally {
      setBusy(false);
    }
  }

  async function handleTokenLogin(e: React.FormEvent) {
    e.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) {
      setError("กรุณากรอกรหัสเข้าใช้งาน (Token)");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const me = await request<{ id: string; role: string; displayName?: string; wards?: string[] }>("/auth/me", candidate);
      onLoginSuccess(candidate, {
        id: me.id,
        role: me.role,
        displayName: me.displayName || me.id,
        wards: me.wards,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยืนยัน Token ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(u: string, p: string) {
    setUsername(u);
    setPassword(p);
    setError("");
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 selection:bg-blue-500 selection:text-white">

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl shadow-blue-500/30 text-white mb-4 border border-blue-400/30">
            <ShieldCheckIcon className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">เวร Easy</h1>
          <p className="text-sm text-gray-500 mt-1">ระบบจัดตารางเวรและบริหารจัดการบุคลากรทางการพยาบาล</p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-gray-200 rounded-3xl p-7 shadow-xl text-gray-700">
          {/* Mode Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6 border border-gray-200">
            <button
              type="button"
              onClick={() => { setMode("account"); setError(""); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                mode === "account"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              เข้าสู่ระบบด้วยบัญชี (Account)
            </button>
            <button
              type="button"
              onClick={() => { setMode("token"); setError(""); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                mode === "token"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              รหัส Token (Direct)
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-600 flex items-start gap-2.5">
              <span className="font-bold text-rose-500">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {mode === "account" ? (
            <form onSubmit={handleAccountLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                  ชื่อผู้ใช้งาน (Username)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="กรอก Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                  รหัสผ่าน (Password)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <LockClosedIcon className="h-5 w-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="กรอกรหัสผ่าน"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl pl-10 pr-10 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition"
                  >
                    {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-600/30 transition transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <span className="animate-spin text-base">⏳</span>
                    <span>กำลังเข้าสู่ระบบ...</span>
                  </>
                ) : (
                  <>
                    <KeyIcon className="w-5 h-5" />
                    <span>เข้าสู่ระบบ (Sign In)</span>
                  </>
                )}
              </button>

              {/* Demo Account Fill Helper */}
              <div className="mt-6 pt-5 border-t border-gray-200">
                <div className="flex items-center justify-between text-[11px] text-gray-400 mb-2">
                  <span className="font-semibold flex items-center gap-1">
                    <SparklesIcon className="w-3.5 h-3.5 text-amber-400" /> บัญชีเริ่มต้นสำหรับทดสอบ:
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemo("admin", "admin1234")}
                    className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-left transition group"
                  >
                    <div className="text-xs font-bold text-blue-500 group-hover:text-blue-600">Super Admin</div>
                    <div className="text-[10px] text-gray-400 font-mono">admin / admin1234</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemo("head", "head1234")}
                    className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-left transition group"
                  >
                    <div className="text-xs font-bold text-emerald-500 group-hover:text-emerald-600">Head Nurse</div>
                    <div className="text-[10px] text-gray-400 font-mono">สร้างเพิ่มได้ใน Admin</div>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleTokenLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                  รหัสโทเคน (Bearer Token)
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="กรอก Token ประจำตัว"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
              >
                {busy ? "กำลังตรวจสอบ..." : "ยืนยันรหัสเข้าใช้งาน"}
              </button>
            </form>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-gray-400 mt-6">
          เวร Easy • ระบบจัดตารางเวร • v2.0
        </p>
      </div>
    </div>
  );
}
