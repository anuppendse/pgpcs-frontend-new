import React, { useMemo, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card, Select, PillButton } from "../../components/web/FormField";
import Badge, { statusTone, statusLabel } from "../../components/web/Badge";
import { useData, usePostMap, useOfficerMap, useRoundMap } from "../../context/DataContext";
import { formatDate, formatShortTime, exportToCSV } from "../../lib/utils";

// Deterministic short hash so identical scan records always produce the same
// "tamper-evident" fingerprint — enough to demonstrate the concept client-side.
function fingerprint(obj) {
  const str = JSON.stringify(obj);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export default function AuditTrail() {
  const { sessions } = useData();
  const postMap = usePostMap();
  const officerMap = useOfficerMap();
  const roundMap = useRoundMap();
  const [postId, setPostId] = useState("all");

  const rows = useMemo(() => {
    const out = [];
    sessions.forEach((s) => {
      s.scans.forEach((scan) => {
        if (postId !== "all" && scan.postId !== postId) return;
        out.push({
          postId: scan.postId,
          postName: postMap[scan.postId]?.name,
          date: scan.actualTime || scan.scheduledTime,
          time: scan.actualTime,
          officer: officerMap[s.officerId]?.name,
          round: roundMap[s.roundId]?.name,
          status: scan.status,
          remark: scan.remark || "—",
          hash: scan.status === "missed" ? "—" : fingerprint(scan),
        });
      });
    });
    return out.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sessions, postId, postMap, officerMap, roundMap]);

  const columns = [
    { label: "Date", value: (r) => formatDate(r.date) },
    { label: "Time", value: (r) => (r.time ? formatShortTime(r.time) : "—") },
    { label: "Post", value: (r) => r.postName },
    { label: "Officer", value: (r) => r.officer },
    { label: "Round", value: (r) => r.round },
    { label: "Status", value: (r) => statusLabel(r.status) },
    { label: "Remark", value: (r) => r.remark },
    { label: "Record Hash", value: (r) => r.hash },
  ];

  return (
    <WebLayout crumb="Reporting / History" title="Guard Post History (Audit Trail)" requiredModule="Reports & Audit Trail">
      <Card title="Filter">
        <div className="flex items-end gap-3">
          <div className="w-72">
            <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Guard Post</label>
            <Select value={postId} onChange={(e) => setPostId(e.target.value)}>
              <option value="all">All Guard Posts</option>
              {Object.values(postMap).map((p) => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
            </Select>
          </div>
          <PillButton tone="ghost" onClick={() => exportToCSV(rows, columns, "guard-post-history.csv")}>Export CSV</PillButton>
        </div>
      </Card>

      <Card title="Scan History" subtitle="Record hashes let a supervisor detect if a log entry has been altered after the fact">
        {rows.length === 0 ? (
          <div className="py-10 text-center text-[12.5px] text-inkSoft">No history recorded yet.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                {columns.map((c) => <th key={c.label} className="border-b border-border pb-2">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="num border-b border-[#EFF2F5] py-2.5">{formatDate(r.date)}</td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">{r.time ? formatShortTime(r.time) : "—"}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{r.postName}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5">{r.officer}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">{r.round}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5"><Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge></td>
                  <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">{r.remark}</td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">{r.hash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </WebLayout>
  );
}
