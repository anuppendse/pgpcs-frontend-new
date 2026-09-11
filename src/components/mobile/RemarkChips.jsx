import React from "react";
import { REMARK_OPTIONS } from "../../lib/mockData";

export default function RemarkChips({ value, onChange }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {REMARK_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(value === r ? "" : r)}
          className={`rounded-full border px-3 py-2 text-[11.5px] ${
            value === r ? "border-accent bg-accent font-bold text-[#06232C]" : "border-dark-border text-[#B8C7D6]"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
