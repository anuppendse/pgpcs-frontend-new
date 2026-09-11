import React, { useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Camera, Check, X } from "lucide-react";
import PhoneChrome from "../../components/mobile/PhoneChrome";
import RemarkChips from "../../components/mobile/RemarkChips";
import { useData, usePostMap } from "../../context/DataContext";
import { formatShortTime } from "../../lib/utils";

export default function PostConfirmation() {
  const { fieldSession, sessions, rounds, actions } = useData();
  const postMap = usePostMap();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const [remark, setRemark] = useState("");
  const [photo, setPhoto] = useState(null);

  const session = sessions.find((s) => s.officerId === fieldSession.officerId && s.status === "in_progress");
  const { postId, scannedAt } = location.state || {};

  if (!session || !postId) return <Navigate to="/mobile/scan" replace />;

  const round = rounds.find((r) => r.id === session.roundId);
  const expectedPostId = round.routePostIds[session.currentIndex];
  const inSequence = postId === expectedPostId;
  const scannedPost = postMap[postId];

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    const result = actions.recordScan(session.id, postId, remark, photo, scannedAt);
    if (!result.ok) return;
    navigate("/mobile/progress");
  }

  return (
    <PhoneChrome title={inSequence ? "Post Confirmed" : "Sequence Warning"} activeTab="scan">
      <div className={`mb-5 rounded-2xl border p-5 text-center ${inSequence ? "border-[#1C4A33] bg-[#0F2A1E]" : "border-[#4A3A1C] bg-[#2A1F0F]"}`}>
        <div className={`mx-auto mb-2.5 flex h-14 w-14 items-center justify-center rounded-full ${inSequence ? "bg-status-green" : "bg-status-amber"}`}>
          {inSequence ? <Check size={26} className="text-[#06232C]" /> : <X size={26} className="text-[#2A1F0F]" />}
        </div>
        <div className="text-[16px] font-extrabold">{scannedPost?.name}</div>
        <div className="mt-0.5 text-[11.5px] text-[#8CA3B8]">
          Scanned at {formatShortTime(scannedAt)}
          {!inSequence && <> · expected {postMap[expectedPostId]?.name}</>}
        </div>
      </div>

      <div className="mb-2.5 text-[12px] font-bold uppercase tracking-wide text-[#8CA3B8]">Add Remark (optional)</div>
      <RemarkChips value={remark} onChange={setRemark} />

      <div className="mb-2.5 text-[12px] font-bold uppercase tracking-wide text-[#8CA3B8]">Photo Evidence (optional)</div>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
      {photo ? (
        <div className="relative mb-4">
          <img src={photo} alt="Captured evidence" className="h-[150px] w-full rounded-xl object-cover" />
          <button onClick={() => setPhoto(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mb-4 flex h-[150px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-dark-border text-[#5F7488]"
        >
          <Camera size={22} />
          <span className="text-[11.5px]">Tap to capture photo</span>
        </button>
      )}

      <button onClick={handleSubmit} className="w-full rounded-xl bg-accent py-3.5 text-[14px] font-extrabold text-[#06232C]">
        Submit &amp; Continue Round
      </button>
    </PhoneChrome>
  );
}
