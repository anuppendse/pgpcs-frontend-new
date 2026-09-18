import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import WebLayout from "../../components/web/WebLayout";
import { Card, PillButton, Select, Field } from "../../components/web/FormField";
import { useData } from "../../context/DataContext";
import { formatDate, formatDateTime } from "../../lib/utils";

export default function QRManagement() {
  const { posts, webSession, actions } = useData();
  const canEdit = webSession.role === "Administrator";
  const location = useLocation();

  // If we arrived here via the "QR" button on Guard Post Management,
  // it passes the post the user clicked as navigation state
  // (navigate("/web/qr", { state: { postId } })). Use that as the
  // initial selection instead of always defaulting to posts[0].
  const [selectedId, setSelectedId] = useState(
    location.state?.postId || posts[0]?.id || ""
  );

  const [previewPostId, setPreviewPostId] = useState(null);
  const canvasWrapRef = useRef(null);
  const selected = posts.find((p) => p.id === selectedId) || posts[0];

  // Fetch fresh QR codes every time this page mounts (not just once
  // at login), same fix applied to Officer Management and Guard Post
  // Management - so switching panels always hits the backend and
  // shows up in the server logs without needing a full page refresh.
  useEffect(() => {
    if (webSession?.accessToken) {
      actions.loadQRCodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  // Handles navigating here again later (e.g. clicking "QR" for a
  // different post while already on this page) - React Router reuses
  // the same component instance, so the state above only runs on the
  // very first mount. This keeps the dropdown in sync on every
  // navigation, not just the first one.
  useEffect(() => {
    if (location.state?.postId) {
      setSelectedId(location.state.postId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.postId]);

  function handleGenerate() {
    if (!selected) return;
    actions.generateQR(selected.id);
  }

  // Opens a small popup window with the QR image, optionally
  // auto-triggering the browser's print dialog once the image has
  // actually loaded inside that window (onload on the <img> itself,
  // rather than a fixed timeout, so it isn't a race against image
  // decode time).
  function openQrWindow(dataUrl, labelText, { autoPrint } = {}) {
    const qrWindow = window.open("", "_blank", "width=420,height=520");

    if (!qrWindow) {
      alert("Please allow pop-ups for this site to view or print QR codes.");
      return;
    }

    qrWindow.document.write(`
      <html>
        <head>
          <title>${labelText}</title>
          <style>
            body {
              margin: 0;
              height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: sans-serif;
            }
            img { width: 260px; height: 260px; }
            p { margin-top: 14px; font-size: 13px; color: #333; }
          </style>
        </head>
        <body>
          <img
            src="${dataUrl}"
            alt="QR Code"
            ${autoPrint ? 'onload="window.focus(); window.print();"' : ""}
          />
          <p>${labelText}</p>
        </body>
      </html>
    `);
    qrWindow.document.close();
  }

  function handlePrint() {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas || !selected?.qrGenerated) return;

    openQrWindow(canvas.toDataURL("image/png"), displayLabel, {
      autoPrint: true,
    });
  }

  function handlePreviewClick(post) {
    setSelectedId(post.id);
    setPreviewPostId(post.id);
  }

  // The table's Preview button can target a post other than the one
  // currently shown in the right-hand panel, so the canvas for it
  // doesn't exist yet at click time. Selecting it above triggers a
  // re-render; once that post's canvas actually appears in the DOM,
  // open the preview window for it.
  useEffect(() => {
    if (!previewPostId || previewPostId !== selectedId) return;

    if (!selected?.qrGenerated) {
      setPreviewPostId(null);
      return;
    }

    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (canvas) {
      openQrWindow(canvas.toDataURL("image/png"), displayLabel, {
        autoPrint: false,
      });
      setPreviewPostId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPostId, selectedId, selected?.qrGenerated]);

  const displayLabel = `${selected?.id} · ${selected?.name}`;

  return (
    <WebLayout crumb="Configuration / QR Codes" title="QR Code Management" requiredModule="QR Code Management">
      <div className="grid grid-cols-[1.3fr_1fr] gap-4">
        <Card title="QR Codes by Guard Post">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Guard Post</th>
                <th className="border-b border-border pb-2">QR Code ID</th>
                <th className="border-b border-border pb-2">Generated</th>
                <th className="border-b border-border pb-2">Last Scanned</th>
                <th className="border-b border-border pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{p.id} — {p.name}</td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">{p.qrCodeId || "—"}</td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">{p.qrGeneratedAt ? formatDate(p.qrGeneratedAt) : "—"}</td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">{p.lastScanned ? formatDateTime(p.lastScanned) : "Never"}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    <button className="text-[11.5px] font-bold text-accent-dark" onClick={() => handlePreviewClick(p)}>
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Generate / Print QR">
          <Field label="Guard Post">
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {posts.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
            </Select>
          </Field>

          <div ref={canvasWrapRef} className="mb-4 flex flex-col items-center rounded-lg border border-border bg-status-grayBg py-6">
            {selected?.qrGenerated ? (
              <>
                <QRCodeCanvas value={selected.qrCodeId} size={150} level="M" includeMargin bgColor="#ffffff" fgColor="#0F2540" />
                <div className="mt-2 text-[11px] font-semibold text-inkSoft">{displayLabel}</div>
                <div className="text-[10px] text-inkSoft">Encodes QR Value: {selected.qrCodeId} (scan with the handheld app)</div>
              </>
            ) : (
              <div className="px-6 text-center text-[12px] text-inkSoft">No QR generated yet for this post.</div>
            )}
          </div>

          {canEdit && (
            <PillButton tone="accent" className="mb-2 w-full justify-center" onClick={handleGenerate}>
              {selected?.qrGenerated ? "Regenerate QR Code" : "Generate New QR Code"}
            </PillButton>
          )}
          <PillButton tone="ghost" className="w-full justify-center" onClick={handlePrint} disabled={!selected?.qrGenerated}>
            Print QR Code
          </PillButton>
        </Card>
      </div>
    </WebLayout>
  );
}