import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useData } from "../../context/DataContext";
import { TextInput, PillButton } from "../../components/web/FormField";

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.1 6.1C3.6 7.86 1 12 1 12s4 8 11 8a10.4 10.4 0 0 0 5-1.3" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function Login() {
  const { webSession, actions } = useData();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (webSession) return <Navigate to="/web/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // webLogin is async in DataContext.jsx (it returns a
      // Promise) - this call was previously missing await,
      // so `result` was always the pending Promise itself,
      // never the resolved { ok, error } object. That made
      // `result.ok` always undefined, so login would always
      // fall into the error branch regardless of whether the
      // credentials were actually correct.
      const result = await actions.webLogin(username, password);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      navigate("/web/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-navy-dark via-navy-light to-navy-lighter">
      <div className="w-[400px] rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center">
          <div className="text-lg font-extrabold text-navy">PerimeterGuard</div>
          <div className="text-xs text-inkSoft">Guard Post Checking &amp; Verification System</div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Username / Officer ID</label>
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} className="mb-3.5" autoFocus />

          <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Password</label>
          <div className="relative mb-2">
            <TextInput
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-inkSoft hover:text-navy"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {error && <div className="mb-3 rounded-lg bg-status-redBg px-3 py-2 text-[11.5px] font-semibold text-status-red">{error}</div>}

          <div className="mb-4 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11.5px] text-inkSoft">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember this device
            </label>
            <a href="#" className="text-[11.5px] font-bold text-accent-dark" onClick={(e) => e.preventDefault()}>
              Forgot password?
            </a>
          </div>

          <PillButton tone="accent" type="submit" className="w-full justify-center py-3 text-[13px]" disabled={submitting}>
            {submitting ? "Signing In..." : "Sign In"}
          </PillButton>
        </form>
      </div>
    </div>
  );
}