import React from "react";
import { cn } from "../../lib/utils";

export default function StatCard({ label, value, tone, delta }) {
  const toneClass = { green: "text-status-green", amber: "text-status-amber", red: "text-status-red" }[tone] || "text-navy";
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft">{label}</div>
      <div className={cn("num mt-1.5 text-[28px] font-extrabold leading-none", toneClass)}>{value}</div>
      {delta && <div className="mt-1 text-[11px] text-inkSoft">{delta}</div>}
    </div>
  );
}
