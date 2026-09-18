import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Camera-based QR decoder. Requires HTTPS (or localhost/127.0.0.1) -
// browsers block getUserMedia on plain-HTTP LAN addresses. See the
// "scan screen camera won't open" discussion this came out of.

// getUserMedia failures have several distinct causes that look
// identical to a user if collapsed into one generic message - only
// NotAllowedError is actually about permissions/HTTPS. Surfacing the
// real reason avoids sending someone down the wrong fix (e.g.
// reconfiguring HTTPS when the real issue is another app already
// holding the camera).
function describeCameraError(err) {
  switch (err?.name) {
    case "NotAllowedError":
      return "Camera permission was denied. Allow camera access and reload.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found on this device.";
    case "NotReadableError":
      return "The camera is already in use by another app or browser tab. Close it and reload.";
    case "SecurityError":
      return "This page must be loaded over HTTPS (or localhost) to use the camera.";
    default:
      return `Unable to access the camera${err?.message ? `: ${err.message}` : "."}`;
  }
}

export default function QRScanner({ onScan, active = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastValueRef = useRef(null);
  const lastScanTimeRef = useRef(0);
  const [error, setError] = useState(null);

  // A caller passing an inline function (e.g. ScanNow.jsx's
  // handleScan, defined fresh on every render, not wrapped in
  // useCallback) would otherwise give onScan a new identity on every
  // render. Keeping it in a ref - updated by this small effect,
  // separate from the camera-starting one below - means tick() always
  // calls the latest onScan without the camera effect ever needing
  // onScan in its own dependency array. Without this, a new onScan
  // reference tears down and restarts the whole camera stream on
  // every re-render, interrupting an in-flight play() and producing
  // an AbortError.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function startCamera() {
      let stream;
      try {
        // Prefer the rear camera (phones/tablets doing real scanning).
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch (err) {
        if (err.name === "OverconstrainedError" || err.name === "NotFoundError") {
          // No rear-facing camera available - most laptops only have a
          // front-facing one. Fall back to whatever camera exists
          // rather than failing outright.
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (fallbackErr) {
            console.error("Camera error (fallback):", fallbackErr);
            setError(describeCameraError(fallbackErr));
            return;
          }
        } else {
          console.error("Camera error:", err);
          setError(describeCameraError(err));
          return;
        }
      }

      try {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!videoRef.current) {
          // The <video> element isn't mounted right now (component
          // re-rendered/unmounted mid-request - more likely now that
          // the fallback path can take two sequential async calls).
          // Nothing to attach to; stop the stream and bail out
          // quietly rather than crashing on a null ref.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setError(null);
        tick();
      } catch (err) {
        console.error("Camera error:", err);
        setError(describeCameraError(err));
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        const nowTs = Date.now();
        // Debounce: the camera re-reads the same physical QR many
        // times per second while it's in frame - ignore repeats of
        // the same code within 3s so one physical scan doesn't fire
        // dozens of submissions.
        if (
          code.data !== lastValueRef.current ||
          nowTs - lastScanTimeRef.current > 3000
        ) {
          lastValueRef.current = code.data;
          lastScanTimeRef.current = nowTs;
          onScanRef.current(code.data);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    startCamera();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [active]);

  return (
    <div className="flex flex-col items-center gap-2">
      {error ? (
        <div className="rounded-lg border border-status-red bg-status-redBg p-4 text-center text-[13px] text-status-red">
          {error}
        </div>
      ) : (
        <video
          ref={videoRef}
          className="w-full max-w-md rounded-lg border border-border"
          muted
          playsInline
        />
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}