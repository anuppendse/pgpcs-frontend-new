import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useData } from "../../context/DataContext";

export default function MobileLogin() {
  const { fieldSession, actions } = useData();
  const navigate = useNavigate();
  const [officerId, setOfficerId] = useState("OFC-014");
  const [pin, setPin] = useState("1234");
  const [error, setError] = useState("");

  if (fieldSession) return <Navigate to="/mobile/rounds" replace />;

  function handleSubmit(e) {
    e.preventDefault();
    const result = actions.fieldLogin(officerId, pin);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate("/mobile/rounds");
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#050B12]">
      <div className="flex h-[844px] max-h-screen w-[390px] max-w-full flex-col bg-dark-bg px-5 py-10 text-white sm:rounded-[36px]">
        <div className="mb-8 flex flex-col items-center">
          <div className="text-[17px] font-extrabold">Checking Officer Login</div>
          <div className="mt-0.5 text-[11.5px] text-[#8CA3B8]">Handheld Scanner Application</div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#8CA3B8]">Officer ID</label>
          <input
            value={officerId}
            onChange={(e) => setOfficerId(e.target.value)}
            className="mb-3.5 w-full rounded-xl border border-dark-border bg-[#0E1D2E] px-3.5 py-3.5 text-[14px] text-white focus:border-accent focus:outline-none"
          />
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#8CA3B8]">PIN</label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mb-3 w-full rounded-xl border border-dark-border bg-[#0E1D2E] px-3.5 py-3.5 text-[14px] text-white focus:border-accent focus:outline-none"
          />
          {error && <div className="mb-3 rounded-lg bg-status-red/20 px-3 py-2 text-[11.5px] font-semibold text-[#FF9E9E]">{error}</div>}
          <button type="submit" className="mb-3 w-full rounded-xl bg-accent py-3.5 text-[14px] font-extrabold text-[#06232C]">
            Sign In
          </button>
        </form>
        <div className="text-center text-[10.5px] text-[#5F7488]">Cached credentials available — works fully offline. (Demo PIN: 1234)</div>
      </div>
    </div>
  );
}
