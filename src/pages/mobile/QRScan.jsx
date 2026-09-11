import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Camera, Keyboard } from "lucide-react";
import PhoneChrome from "../../components/mobile/PhoneChrome";
import { useData, usePostMap } from "../../context/DataContext";
import { formatDuration } from "../../lib/utils";

const READER_ID = "qr-reader-region";

export default function QRScan() {
  const { fieldSession, sessions, rounds } = useData();
  const postMap = usePostMap();
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [cameraState, setCameraState] = useState("starting"); // starting | running | unavailable
  const [manualMode, setManualMode] = useState(false);
  const [manualPostId, setManualPostId] = useState("");
  const [scanError, setScanError] = useState("");
  const scannerRef = useRef(null);
  const runningRef = useRef(false); // true only once .start() has actually resolved

  const session = sessions.find((s) => s.officerId === fieldSession.officerId && s.status === "in_progress");
  const round = session ? rounds.find((r) => r.id === session.roundId) : null;

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Safe to call any time — swallows the "scanner is not running" throw that
  // html5-qrcode raises (sometimes synchronously) when stop() is called on an
  // instance that never successfully started (e.g. no camera / permission denied).
  function safeStopScanner() {
    const instance = scannerRef.current;
    if (!instance || !runningRef.current) return Promise.resolve();
    runningRef.current = false;
    try {
      return instance.stop().then(() => instance.clear()).catch(() => {});
    } catch (e) {
      return Promise.resolve();
    }
  }

  useEffect(() => {
    if (!session || !round || session.currentIndex >= round.routePostIds.length) return;
    let cancelled = false;

    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;
        const instance = new Html5Qrcode(READER_ID, { verbose: false });
        scannerRef.current = instance;
        instance
          .start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 220 },
            (decodedText) => handleDecoded(decodedText),
            () => {} // per-frame "not found" callback — ignored, this fires constantly
          )
          .then(() => {
            if (cancelled) return;
            runningRef.current = true;
            setCameraState("running");
          })
          .catch(() => !cancelled && setCameraState("unavailable"));
      })
      .catch(() => setCameraState("unavailable"));

    return () => {
      cancelled = true;
      safeStopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.currentIndex]);

  function stopCamera() {
    safeStopScanner();
  }

  function handleDecoded(decodedText) {
    const postId = decodedText.trim();
    if (!postMap[postId]) {
      setScanError(`Unrecognized QR code: "${postId}"`);
      return;
    }
    stopCamera();
    goToConfirmation(postId);
  }

  function goToConfirmation(postId) {
    navigate("/mobile/confirm", { state: { postId, scannedAt: new Date().toISOString() } });
  }

  function handleManualConfirm() {
    if (!manualPostId) return;
    stopCamera();
    goToConfirmation(manualPostId);
  }

  if (!session) return <Navigate to="/mobile/rounds" replace />;
  if (session.currentIndex >= round.routePostIds.length) return <Navigate to="/mobile/progress" replace />;

  const expectedPostId = round.routePostIds[session.currentIndex];

  return (
    <PhoneChrome title="Scan Post" activeTab="scan">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#8CA3B8]">
        {round.name} · Post {session.currentIndex + 1} of {round.routePostIds.length}
      </div>

      {!manualMode ? (
        <>
          <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-[20px] border border-[#164256] bg-[#03293A]">
            <div id={READER_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
            {cameraState !== "running" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#03293A] text-center text-[12px] text-[#8CA3B8]">
                <Camera size={28} />
                {cameraState === "starting" ? "Starting camera…" : "Camera unavailable in this browser/device."}
              </div>
            )}
          </div>
          <div className="mb-4 text-center">
            <div className="text-[15px] font-extrabold">Align QR code within frame</div>
            <div className="mt-0.5 text-[11.5px] text-[#8CA3B8]">Next expected: {postMap[expectedPostId]?.name}</div>
            {scanError && <div className="mt-2 text-[11.5px] font-semibold text-[#FF9E9E]">{scanError}</div>}
          </div>
        </>
      ) : (
        <div className="mb-4 rounded-2xl border border-dark-border bg-dark-card p-4">
          <div className="mb-2 text-[12px] font-bold text-[#8CA3B8]">SELECT GUARD POST</div>
          <select
            value={manualPostId}
            onChange={(e) => setManualPostId(e.target.value)}
            className="mb-3 w-full rounded-xl border border-dark-border bg-[#0E1D2E] px-3 py-3 text-[13px] text-white"
          >
            <option value="">Choose a post…</option>
            {Object.values(postMap).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.id === expectedPostId ? "(expected next)" : ""}
              </option>
            ))}
          </select>
          <button onClick={handleManualConfirm} disabled={!manualPostId} className="w-full rounded-xl bg-accent py-3 text-[13.5px] font-extrabold text-[#06232C] disabled:opacity-40">
            Confirm Post
          </button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-dark-border bg-dark-card p-4 text-center">
        <div>
          <div className="text-[10px] text-[#8CA3B8]">ROUND TIMER</div>
          <div className="num text-[15px] font-extrabold">{formatDuration(Date.now() - new Date(session.startedAt).getTime())}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#8CA3B8]">POSTS DONE</div>
          <div className="num text-[15px] font-extrabold">{session.scans.length} / {round.routePostIds.length}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#8CA3B8]">NEXT UP</div>
          <div className="text-[12px] font-extrabold">{postMap[expectedPostId]?.name?.split(" ")[0]}</div>
        </div>
      </div>

      <button
        onClick={() => setManualMode((m) => !m)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dark-border py-3 text-[13px] font-bold text-[#B8C7D6]"
      >
        <Keyboard size={16} />
        {manualMode ? "Back to Camera Scan" : "Enter Code Manually"}
      </button>
    </PhoneChrome>
  );
}
