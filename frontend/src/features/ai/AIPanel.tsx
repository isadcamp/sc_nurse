"use client";
import { useCallback, useEffect, useState } from "react";
import { request } from "@/lib/api";
import type { AIAnalysisData, AIDraftComparisonData, Roster, RosterResponse, ScheduleSummary } from "@/types/schedule";

interface AIPanelProps {
  roster: Roster;
  canEdit: boolean;
  token: string;
  versions: ScheduleSummary[];
  onScheduleUpdated: (data: RosterResponse) => void;
}

export function AIPanel({ roster, token, versions, onScheduleUpdated, canEdit }: AIPanelProps) {
  const [analysis, setAnalysis] = useState<AIAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [applyingSug, setApplyingSug] = useState<string | null>(null);

  // Comparison state
  const [compareTargetId, setCompareTargetId] = useState<number>(() => {
    const other = versions.find(v => v.id !== roster.id);
    return other ? other.id : roster.id;
  });
  const [comparison, setComparison] = useState<AIDraftComparisonData | null>(null);
  const [comparing, setComparing] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await request<{ data: AIAnalysisData }>(`/schedules/${roster.id}/ai/analyze`, token, "POST");
      setAnalysis(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "วิเคราะห์ AI ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [roster.id, token]);

  useEffect(() => {
    let unmounted = false;
    async function loadInitial() {
      try {
        const res = await request<{ data: AIAnalysisData }>(`/schedules/${roster.id}/ai/analysis`, token, "GET");
        if (!unmounted) {
          setAnalysis(res.data);
        }
      } catch {
        // Run fresh if not cached
        if (!unmounted) {
          void runAnalysis();
        }
      }
    }
    void loadInitial();
    return () => {
      unmounted = true;
    };
  }, [roster.id, token, runAnalysis]);

  async function handleAccept(suggestionId: string) {
    setApplyingSug(suggestionId);
    setError("");
    setNotice("");
    try {
      const updated = await request<RosterResponse>(`/ai/suggestions/${suggestionId}/accept?scheduleId=${roster.id}`, token, "POST", { scheduleId: roster.id });
      onScheduleUpdated(updated);
      setNotice("นำข้อเสนอการสลับเวรไปปรับใช้กับตารางสำเร็จแล้ว");
      // Reload analysis
      void runAnalysis();
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำข้อเสนอไปใช้ไม่สำเร็จ");
    } finally {
      setApplyingSug(null);
    }
  }

  async function handleReject(suggestionId: string) {
    try {
      await request(`/ai/suggestions/${suggestionId}/reject?scheduleId=${roster.id}`, token, "POST", { scheduleId: roster.id });
      if (analysis) {
        setAnalysis({
          ...analysis,
          suggestions: analysis.suggestions.map(s => s.id === suggestionId ? { ...s, status: "rejected" } : s),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ปฏิเสธข้อเสนอไม่สำเร็จ");
    }
  }

  async function handleCompare() {
    if (!compareTargetId) return;
    setComparing(true);
    setError("");
    try {
      const res = await request<{ data: AIDraftComparisonData }>("/schedules/compare", token, "POST", {
        baseId: roster.id,
        compareId: compareTargetId,
      });
      setComparison(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปรียบเทียบร่างไม่สำเร็จ");
    } finally {
      setComparing(false);
    }
  }

  const isEditable = canEdit && (roster.status === "draft" || roster.status === "generated");

  return (
    <div className="nf-feature">
      {/* Header & Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem" }}>🤖 AI ผู้ช่วยวิเคราะห์ เสนอสลับเวร และเปรียบเทียบร่าง</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: ".88rem" }}>
            ระบบใช้ข้อเท็จจริงจากตัวตรวจกฎ (Validator) และสถิติรวม เพื่อประเมินคุณภาพและเสนอทางเลือก
          </p>
        </div>
        <button
          onClick={() => void runAnalysis()}
          disabled={loading}
          style={{
            background: "#4f46e5",
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            fontSize: ".95rem",
          }}
        >
          {loading ? "กำลังวิเคราะห์…" : "🔄 วิเคราะห์ตารางใหม่"}
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status" style={{ background: "#ecfdf5", color: "#065f46", padding: "10px 14px", borderRadius: 8, border: "1px solid #a7f3d0" }}>{notice}</p>}

      {analysis?.isStale && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "12px 16px", borderRadius: 10, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#92400e", fontWeight: 600 }}>
            ⚠️ ข้อมูลตารางมีการเปลี่ยนแปลงหลังจากวิเคราะห์ครั้งล่าสุด ผลวิเคราะห์นี้อาจล้าสมัย
          </span>
          <button onClick={() => void runAnalysis()} disabled={loading} style={{ background: "#d97706", color: "white", padding: "6px 12px", fontSize: ".85rem" }}>
            วิเคราะห์ใหม่ทันที
          </button>
        </div>
      )}

      {/* Summary Score Card */}
      {analysis && (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 22px", marginBottom: 24, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <span style={{ fontSize: ".85rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>คะแนนคุณภาพตารางเวร (Quality Score)</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <strong style={{ fontSize: "2.2rem", color: analysis.overallScore >= 80 ? "#16a34a" : analysis.overallScore >= 60 ? "#d97706" : "#dc2626" }}>
                  {analysis.overallScore.toFixed(1)}
                </strong>
                <span style={{ color: "#94a3b8", fontSize: "1.1rem" }}>/ 100</span>
              </div>
            </div>
            <div style={{ maxWidth: 650 }}>
              <p style={{ margin: 0, fontSize: ".95rem", color: "#334155", lineHeight: 1.5 }}>
                {analysis.summary}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section: AI Swap Suggestions */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-title">
          <div>
            <h2>✨ ข้อเสนอการสลับเวรเพื่อปรับปรุงตาราง (AI Swap Suggestions)</h2>
            <p>ข้อเสนอทุกรายการผ่านการตรวจด้วย Validation Engine แล้วว่าไม่ทำให้เกิดข้อบังคับผิดพลาดใหม่</p>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {analysis?.suggestions.length === 0 ? (
            <p style={{ color: "#64748b", margin: 0 }}>
              ✓ ไม่พบข้อเสนอสลับเวรเร่งด่วน หรือตารางมีความสมบูรณ์ตามเกณฑ์ที่กำหนดแล้ว
            </p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {analysis?.suggestions.map(sug => {
                const isAccepted = sug.status === "accepted";
                const isRejected = sug.status === "rejected";
                return (
                  <div
                    key={sug.id}
                    style={{
                      border: isAccepted ? "1px solid #86efac" : isRejected ? "1px solid #e2e8f0" : "1px solid #cbd5e1",
                      background: isAccepted ? "#f0fdf4" : isRejected ? "#f8fafc" : "white",
                      borderRadius: 10,
                      padding: 18,
                      opacity: isRejected ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: "1.05rem", color: "#1e293b" }}>{sug.title}</strong>
                          <span style={{ background: "#e0e7ff", color: "#4338ca", fontSize: ".78rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                            +{(sug.improvement).toFixed(0)} คะแนนคุณภาพ
                          </span>
                          {isAccepted && <span style={{ background: "#dcfce7", color: "#15803d", fontSize: ".78rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>✓ นำไปใช้แล้ว</span>}
                          {isRejected && <span style={{ background: "#f1f5f9", color: "#64748b", fontSize: ".78rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>✕ ปฏิเสธแล้ว</span>}
                        </div>
                        <p style={{ margin: "6px 0", color: "#475569", fontSize: ".9rem" }}>{sug.description}</p>
                        <small style={{ color: "#64748b" }}><b>เหตุผล:</b> {sug.reason}</small>
                      </div>

                      {sug.status === "proposed" && isEditable && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => void handleAccept(sug.id)}
                            disabled={applyingSug === sug.id || loading}
                            style={{ background: "#16a34a", color: "white", padding: "8px 14px", fontSize: ".85rem" }}
                          >
                            {applyingSug === sug.id ? "กำลังใช้…" : "✅ นำไปใช้กับตาราง"}
                          </button>
                          <button
                            onClick={() => void handleReject(sug.id)}
                            disabled={applyingSug === sug.id || loading}
                            style={{ background: "#64748b", color: "white", padding: "8px 14px", fontSize: ".85rem" }}
                          >
                            ❌ ปฏิเสธ
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Proposed changes detail */}
                    <div style={{ marginTop: 12, background: "#f8fafc", padding: "10px 14px", borderRadius: 8 }}>
                      <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#64748b" }}>รายการเวรที่จะถูกปรับเปลี่ยน:</span>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 20, fontSize: ".88rem", color: "#334155" }}>
                        {sug.changes.map((ch, idx) => (
                          <li key={idx}>
                            <b>{ch.nurseName}</b> ในวันที่ {ch.date}: เปลี่ยนจากเวร <code>{ch.oldShiftCode}</code> ➔ <b>{ch.newShiftCode}</b>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section: AI Analysis Findings */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-title">
          <div>
            <h2>🔍 ข้อค้นพบและข้อเสนอแนะจำแนกตามหมวดหมู่ (AI Findings)</h2>
            <p>วิเคราะห์จากข้อบังคับ, อัตรากำลังรายช่วงเวลา, และความเท่าเทียม</p>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {analysis?.findings.length === 0 ? (
            <p style={{ color: "#16a34a", margin: 0, fontWeight: 600 }}>✓ ไม่พบข้อผิดพลาดหรือข้อควรปรับปรุงในตารางนี้</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {analysis?.findings.map(f => {
                const isCritical = f.severity === "critical";
                return (
                  <div
                    key={f.id}
                    style={{
                      borderLeft: isCritical ? "4px solid #dc2626" : "4px solid #f59e0b",
                      background: isCritical ? "#fff5f5" : "#fffbeb",
                      padding: "12px 16px",
                      borderRadius: "0 8px 8px 0",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ color: isCritical ? "#991b1b" : "#92400e", fontSize: ".95rem" }}>
                        {isCritical ? "⛔ " : "⚠️ "} {f.title}
                      </strong>
                      <span style={{ fontSize: ".75rem", textTransform: "uppercase", fontWeight: 700, color: isCritical ? "#b91c1c" : "#b45309" }}>
                        หมวด: {f.category}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0", fontSize: ".9rem", color: "#334155" }}>{f.description}</p>
                    {f.suggestion && (
                      <p style={{ margin: "4px 0 0", fontSize: ".85rem", color: "#0369a1" }}>
                        💡 <b>คำแนะนำ:</b> {f.suggestion}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section: Draft Comparison with AI Narrative */}
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>⚖️ เปรียบเทียบ 2 ร่างตารางด้วย AI (Draft Comparison)</h2>
            <p>เลือกอีกหนึ่งรุ่นตารางเพื่อเปรียบเทียบข้อดี ข้อเสีย และคำแนะนำจาก AI</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={compareTargetId}
              onChange={e => setCompareTargetId(Number(e.target.value))}
              style={{ padding: "6px 10px" }}
            >
              {versions.map(v => (
                <option key={v.id} value={v.id}>
                  รุ่น v{v.version} (#{v.id}) — {v.status}
                </option>
              ))}
            </select>
            <button
              onClick={() => void handleCompare()}
              disabled={comparing || !compareTargetId}
              style={{ background: "#2563eb", color: "white", padding: "7px 14px", fontSize: ".9rem" }}
            >
              {comparing ? "กำลังเทียบ…" : "เปรียบเทียบ"}
            </button>
          </div>
        </div>

        {comparison && (
          <div style={{ padding: 20 }}>
            <div style={{ background: "#f8fafc", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 18 }}>
              <strong style={{ color: "#1e293b", fontSize: "1.05rem" }}>💡 คำอธิบายและคำแนะนำจาก AI:</strong>
              <p style={{ margin: "8px 0", color: "#334155", lineHeight: 1.5 }}>{comparison.aiExplanation}</p>
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "8px 12px", borderRadius: 6, color: "#065f46", fontWeight: 700, fontSize: ".9rem" }}>
                🏆 {comparison.recommendation}
              </div>
            </div>

            {/* Pros & Cons Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
                <h4 style={{ margin: "0 0 8px", color: "#1e3a8a" }}>รุ่น v{comparison.baseVersion} (รุ่นปัจจุบัน)</h4>
                <p style={{ margin: 0, fontSize: ".85rem", color: "#64748b" }}>ข้อผิดพลาดร้ายแรง: {comparison.baseViolations} จุด</p>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#16a34a" }}>ข้อดี:</span>
                  <ul style={{ margin: "2px 0 8px", paddingLeft: 18, fontSize: ".85rem" }}>
                    {comparison.prosDraftA.length === 0 ? <li>—</li> : comparison.prosDraftA.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                  <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#dc2626" }}>ข้อเสีย:</span>
                  <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: ".85rem" }}>
                    {comparison.consDraftA.length === 0 ? <li>—</li> : comparison.consDraftA.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              </div>

              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
                <h4 style={{ margin: "0 0 8px", color: "#1e3a8a" }}>รุ่น v{comparison.compareVersion} (รุ่นที่นำมาเทียบ)</h4>
                <p style={{ margin: 0, fontSize: ".85rem", color: "#64748b" }}>ข้อผิดพลาดร้ายแรง: {comparison.compViolations} จุด</p>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#16a34a" }}>ข้อดี:</span>
                  <ul style={{ margin: "2px 0 8px", paddingLeft: 18, fontSize: ".85rem" }}>
                    {comparison.prosDraftB.length === 0 ? <li>—</li> : comparison.prosDraftB.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                  <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#dc2626" }}>ข้อเสีย:</span>
                  <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: ".85rem" }}>
                    {comparison.consDraftB.length === 0 ? <li>—</li> : comparison.consDraftB.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
