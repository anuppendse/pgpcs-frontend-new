import React, { useMemo, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import StatCard from "../../components/web/StatCard";
import { Card, Select, PillButton } from "../../components/web/FormField";
import Badge, { statusTone, statusLabel } from "../../components/web/Badge";
import { useData, usePostMap, useOfficerMap, useRoundMap } from "../../context/DataContext";
import { formatDateTime, minutesBetween } from "../../lib/utils";

const TYPES = ["all", "missed", "late", "out_of_sequence", "emergency"];

export default function Alerts() {
  const { alerts, actions } = useData();
  const postMap = usePostMap();
  const officerMap = useOfficerMap();
  const roundMap = useRoundMap();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return [...alerts]
      .filter((a) => typeFilter === "all" || a.type === typeFilter)
      .filter((a) => statusFilter === "all" || a.status === statusFilter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [alerts, typeFilter, statusFilter]);

  const open = alerts.filter((a) => a.status === "open").length;
  const acknowledged = alerts.filter((a) => a.status === "acknowledged").length;
  const resolved = alerts.filter((a) => a.status === "resolved").length;

  return (
    <WebLayout crumb="Reporting / Alerts" title="Alerts & Exceptions" requiredModule="Alerts & Exceptions">
      <div className="mb-5 grid grid-cols-4 gap-4">
        <StatCard label="Open Alerts" value={open} tone="red" />
        <StatCard label="Acknowledged" value={acknowledged} tone="amber" />
        <StatCard label="Resolved" value={resolved} tone="green" />
        <StatCard label="Total Logged" value={alerts.length} />
      </div>

      <Card
        title="Exception Log"
        right={
          <div className="flex gap-2">
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-44">
              {TYPES.map((t) => <option key={t} value={t}>{t === "all" ? "All types" : statusLabel(t)}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
              {["all", "open", "acknowledged", "resolved"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : statusLabel(s)}</option>)}
            </Select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-[12.5px] text-inkSoft">No alerts match this filter.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Type</th>
                <th className="border-b border-border pb-2">Post</th>
                <th className="border-b border-border pb-2">Officer</th>
                <th className="border-b border-border pb-2">Scheduled</th>
                <th className="border-b border-border pb-2">Actual</th>
                <th className="border-b border-border pb-2">Round</th>
                <th className="border-b border-border pb-2">Remark</th>
                <th className="border-b border-border pb-2">Status</th>
                <th className="border-b border-border pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="border-b border-[#EFF2F5] py-2.5"><Badge tone={statusTone(a.type)}>{a.category || statusLabel(a.type)}</Badge></td>
                  <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{postMap[a.postId]?.name || "—"}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5">{officerMap[a.officerId]?.name || "—"}</td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">{a.scheduledTime ? formatDateTime(a.scheduledTime) : "—"}</td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {a.actualTime ? formatDateTime(a.actualTime) : "—"}
                    {a.type === "late" && a.actualTime && ` (+${minutesBetween(a.scheduledTime, a.actualTime)}m)`}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">{roundMap[a.roundId]?.name || "—"}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">{a.remark || "—"}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5"><Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge></td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    <div className="flex gap-2">
                      {a.status === "open" && <PillButton tone="ghost" className="px-2.5 py-1 text-[11px]" onClick={() => actions.acknowledgeAlert(a.id)}>Acknowledge</PillButton>}
                      {a.status !== "resolved" && <PillButton tone="ghost" className="px-2.5 py-1 text-[11px]" onClick={() => actions.resolveAlert(a.id)}>Resolve</PillButton>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </WebLayout>
  );
}
