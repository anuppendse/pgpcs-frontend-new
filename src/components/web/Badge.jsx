import React from "react";
import { cn } from "../../lib/utils";

const TONES = {
  green: "bg-status-greenBg text-status-green",
  amber: "bg-status-amberBg text-[#9C6A0C]",
  red: "bg-status-redBg text-status-red",
  gray: "bg-status-grayBg text-status-gray",
  blue: "bg-[#E4F1F8] text-accent-dark",
};

const DOT = {
  green: "bg-status-green",
  amber: "bg-status-amber",
  red: "bg-status-red",
  gray: "bg-status-gray",
  blue: "bg-accent",
};

export default function Badge({ tone = "gray", children, className }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", TONES[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

// Maps common domain statuses to a Badge tone so pages don't repeat this switch.
export function statusTone(status) {
  switch (status) {
    case "on_time":
    case "Active":
    case "Synced":
    case "Printed":
    case "Checked":
    case "Completed":
    case "Assigned":
    case "resolved":
      return "green";
    case "late":
    case "Pending":
    case "acknowledged":
    case "Not Printed":
    case "Running Late":
      return "amber";
    case "missed":
    case "out_of_sequence":
    case "open":
    case "On Leave":
    case "emergency":
      return "red";
    case "in_progress":
      return "blue";
    default:
      return "gray";
  }
}

export function statusLabel(status) {
  const map = {
    on_time: "On Time",
    late: "Late",
    missed: "Missed",
    out_of_sequence: "Out of Sequence",
    in_progress: "In Progress",
    open: "Open",
    acknowledged: "Acknowledged",
    resolved: "Resolved",
    emergency: "Emergency",
  };
  return map[status] || status;
}
