import React from "react";

const baseInput =
  "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[12.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-status-grayBg disabled:text-inkSoft";

export function Field({ label, hint, children }) {
  return (
    <div className="mb-3.5">
      {label && <label className="mb-1.5 block text-[11.5px] font-bold text-navy">{label}</label>}
      {children}
      {hint && <div className="mt-1 text-[10.5px] text-inkSoft">{hint}</div>}
    </div>
  );
}

export function TextInput(props) {
  return <input {...props} className={baseInput + (props.className ? " " + props.className : "")} />;
}

export function TextArea(props) {
  return <textarea {...props} className={baseInput + (props.className ? " " + props.className : "")} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={baseInput + (props.className ? " " + props.className : "")}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
      aria-pressed={checked}
    >
      <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${checked ? "bg-status-green" : "bg-[#CBD3DB]"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
      {label && <span className="text-[12px] text-ink">{label}</span>}
    </button>
  );
}

export function PillButton({ children, tone = "navy", className = "", ...props }) {
  const tones = {
    navy: "bg-navy text-white hover:bg-navy-light",
    accent: "bg-accent text-[#052934] hover:bg-accent-dark hover:text-white",
    ghost: "bg-white text-navy border border-border hover:bg-status-grayBg",
    danger: "bg-status-red text-white hover:bg-[#b93a3a]",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ title, subtitle, right, children, className = "" }) {
  return (
    <div className={`mb-4 rounded-xl border border-border bg-white p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            {title && <h2 className="text-[14.5px] font-bold text-navy">{title}</h2>}
            {subtitle && <div className="text-[11.5px] font-medium text-inkSoft">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
