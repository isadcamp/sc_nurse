"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/api";
import type { ScheduleSummaryData } from "@/types/schedule";

interface DashboardPanelProps {
  scheduleId: number;
  wardId: string;
  month: number;
  year: number;
  version: number;
  token: string;
}

export function DashboardPanel({ scheduleId, wardId, month, year, version, token }: DashboardPanelProps) {
  const [data, setData] = useState<ScheduleSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let unmounted = false;
    async function loadSummary() {
      setLoading(true);
      setError("");
      try {
        const res = await request<{ data: ScheduleSummaryData }>(`/schedules/${scheduleId}/summary`, token);
        if (!unmounted) {
          setData(res.data);
        }
      } catch (e) {
        if (!unmounted) {
          setError(e instanceof Error ? e.message : "โหลดข้อมูลสรุปไม่สำเร็จ");
        }
      } finally {
        if (!unmounted) {
          setLoading(false);
        }
      }
    }
    void loadSummary();
    return () => {
      unmounted = true;
    };
  }, [scheduleId, token]);

  async function handleDownloadExcel() {
    setDownloading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
      const res = await fetch(`${baseUrl}/schedules/${scheduleId}/export/xlsx`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Export failed: ${res.statusText}`);
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `schedule_${wardId}_${year}_${String(month).padStart(2, "0")}_v${version}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert(e instanceof Error ? e.message : "ดาวน์โหลด Excel ไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return <p role="status">กำลังคำนวณและโหลดสถิติภาพรวม…</p>;
  }

  if (error) {
    return <p className="error" role="alert">{error}</p>;
  }

  if (!data) return null;

  const totals = data.totals;

  return (
    <div className="nf-feature">
      {/* Top action row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem" }}>📊 แดชบอร์ดสรุปสถิติและอัตรากำลัง</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: ".88rem" }}>
            สรุปชั่วโมงทำงานและอัตรากำลังของตารางเวรฉบับนี้
          </p>
        </div>
        <button
          onClick={() => void handleDownloadExcel()}
          disabled={downloading}
          style={{
            background: "#15803d",
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            fontSize: ".95rem",
          }}
        >
          {downloading ? "กำลังสร้าง Excel…" : "📥 ดาวน์โหลด Excel (.xlsx)"}
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <article>
          <span>บุคลากรที่ใช้งาน / ทั้งหมด</span>
          <strong>{totals.activeStaff} <small style={{ fontSize: "1rem" }}>/ {totals.totalStaff} คน</small></strong>
          <small>{totals.totalAssignments} รายการจัดเวร</small>
        </article>

        <article>
          <span>ชั่วโมงตามแผนรวม</span>
          <strong>{totals.totalPlannedHours} <small style={{ fontSize: "1rem" }}>ชม.</small></strong>
          <small>เวรดึก {totals.totalNightHours} ชม.</small>
        </article>

        <article>
          <span>เวรทำงาน / เวรควบ</span>
          <strong>{totals.totalWorkShifts} <small style={{ fontSize: "1rem" }}>เวร</small></strong>
          <small>เวรควบ (Double) {totals.totalDoubleShifts} ครั้ง</small>
        </article>

        <article className={totals.hardViolations > 0 ? "warning" : ""}>
          <span>ข้อผิดพลาด / คำเตือน</span>
          <strong style={{ color: totals.hardViolations > 0 ? "#dc2626" : "#16a34a" }}>
            {totals.hardViolations} <small style={{ fontSize: "1rem", color: "#64748b" }}>/ {totals.softViolations}</small>
          </strong>
          <small>{totals.hardViolations === 0 ? "✓ ผ่านข้อบังคับทั้งหมด" : "⛔ มีข้อบังคับที่ผิด"}</small>
        </article>
      </div>

      {/* Daily Staffing Interval Heatmap */}
      <div className="panel" style={{ marginTop: 24, marginBottom: 24 }}>
        <div className="panel-title">
          <div>
            <h2>กำลังคนรายวันและ 4 ช่วงเวลา (Daily Staffing Coverage)</h2>
            <p>เทียบจำนวนคนจริง (RN+PN) vs ขั้นต่ำตามนโยบาย</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" style={{ width: 110 }}>วันที่</th>
                <th scope="col">00:00 - 08:00 (ดึก)</th>
                <th scope="col">08:00 - 16:00 (เช้า)</th>
                <th scope="col">16:00 - 20:00 (บ่ายช่วงต้น)</th>
                <th scope="col">20:00 - 24:00 (บ่ายช่วงดึก)</th>
              </tr>
            </thead>
            <tbody>
              {data.dailyStaffing.map(d => {
                return (
                  <tr key={d.date}>
                    <th scope="row" className={d.isHoliday ? "holiday" : ""}>
                      {d.date.slice(-2)} ({d.dayOfWeek})
                      {d.holidayName && <small>★ {d.holidayName}</small>}
                    </th>
                    {d.intervals.map((iv, i) => {
                      const hasDeficit = iv.deficit > 0;
                      return (
                        <td
                          key={i}
                          style={{
                            background: hasDeficit ? "#fee2e2" : iv.actualTotal > 0 ? "#f0fdf4" : "inherit",
                            border: hasDeficit ? "1px solid #fca5a5" : "1px solid #e2e8f0",
                          }}
                        >
                          <div style={{ fontWeight: 700, color: hasDeficit ? "#b91c1c" : "#1e293b" }}>
                            {hasDeficit && "⚠️ "}
                            {iv.actualTotal} คน (RN {iv.actualRn}, PN {iv.actualPn})
                          </div>
                          <div style={{ fontSize: ".75rem", color: hasDeficit ? "#dc2626" : "#64748b" }}>
                            ต้องการ: {iv.requiredTotal || "—"} คน
                            {hasDeficit && <b> (ขาด {iv.deficit} คน)</b>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nurse Workload & Fairness Table */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-title">
          <div>
            <h2>สรุปภาระงานและความเท่าเทียมรายบุคคล (Nurse Workload & Fairness)</h2>
            <p>ชั่วโมงตามแผน, เป้าหมาย, วันหยุด, วันลา, ภาระกลางคืน</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">บุคลากร</th>
                <th scope="col">ตำแหน่ง</th>
                <th scope="col">ชั่วโมงตามแผน</th>
                <th scope="col">เป้าหมาย (ชม.)</th>
                <th scope="col">ส่วนต่าง (+/-)</th>
                <th scope="col">วันทำงาน</th>
                <th scope="col">วันหยุด (X)</th>
                <th scope="col">วันลา (L)</th>
                <th scope="col">เวรควบ</th>
                <th scope="col">เวรดึก (ชม.)</th>
                <th scope="col">จำนวนเวรดึก</th>
                <th scope="col">ยกมา / ล้ำไป (ชม.)</th>
              </tr>
            </thead>
            <tbody>
              {data.nurseStats.map(n => (
                <tr key={n.nurseId}>
                  <th scope="row"><strong>{n.nurseName}</strong></th>
                  <td>{n.position}</td>
                  <td><b>{n.plannedHours}</b> ชม.</td>
                  <td>{n.targetHours > 0 ? `${n.targetHours} ชม.` : "—"}</td>
                  <td style={{ color: n.varianceHours > 0 ? "#2563eb" : n.varianceHours < 0 ? "#dc2626" : "#16a34a" }}>
                    {n.targetHours > 0 ? (n.varianceHours > 0 ? `+${n.varianceHours}` : `${n.varianceHours}`) : "—"}
                  </td>
                  <td>{n.workDays} วัน</td>
                  <td>{n.offDays} วัน</td>
                  <td>{n.leaveDays > 0 ? <b style={{ color: "#7e22ce" }}>{n.leaveDays} วัน</b> : "0 วัน"}</td>
                  <td>{n.doubleShifts > 0 ? <b style={{ color: "#d97706" }}>{n.doubleShifts}</b> : "0"}</td>
                  <td>{n.nightHours} ชม.</td>
                  <td>{n.nightShifts} เวร</td>
                  <td>{n.carryInHours} / {n.carryOutHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
