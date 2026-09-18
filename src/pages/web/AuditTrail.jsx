import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card, Select, PillButton } from "../../components/web/FormField";
import Badge, { statusTone, statusLabel } from "../../components/web/Badge";
import { useData } from "../../context/DataContext";
import { formatDate, formatShortTime, exportToCSV } from "../../lib/utils";

export default function AuditTrail() {
  const { webSession, posts, officers, actions } = useData();

  const [postId, setPostId] = useState("all");
  const [scans, setScans] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const pageSize = 25;

  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadPosts();
    actions.loadOfficers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  useEffect(() => {
    if (!webSession?.accessToken) return;

    let cancelled = false;
    setLoading(true);

    const params = { page, page_size: pageSize };
    if (postId !== "all") {
      params.post_id = postId;
    }

    actions.loadScans(params).then((result) => {
      if (cancelled) return;
      if (result?.ok) {
        setScans(result.items);
        setTotal(result.total);
      } else {
        alert(result?.error || "Unable to load scan history.");
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, postId, page]);

  // Reset to page 1 whenever the filter changes.
  useEffect(() => {
    setPage(1);
  }, [postId]);

  function postName(id) {
    const post = posts.find((p) => Number(p.backendId) === Number(id));
    return post?.name || `Post #${id}`;
  }

  function officerName(id) {
    const officer = officers.find((o) => Number(o.id) === Number(id));
    return officer?.name || `Officer #${id}`;
  }

  // statusTone/statusLabel expect lowercase-ish values ("on_time",
  // "late", "missed", "out_of_sequence") - the backend sends the
  // uppercase ScanStatus enum value, so normalize before using them.
  function scanStatusKey(status) {
    return String(status || "").toLowerCase();
  }

  const rows = scans.map((s) => ({
    date: s.scan_timestamp,
    time: s.scan_timestamp,
    postName: postName(s.post_id),
    officer: officerName(s.officer_id),
    status: scanStatusKey(s.status),
    delay: s.delay_minutes,
    sequence: s.sequence_no ?? "—",
  }));

  const columns = [
    { label: "Date", value: (r) => formatDate(r.date) },
    { label: "Time", value: (r) => formatShortTime(r.time) },
    { label: "Post", value: (r) => r.postName },
    { label: "Officer", value: (r) => r.officer },
    { label: "Status", value: (r) => statusLabel(r.status) },
    { label: "Delay (min)", value: (r) => r.delay },
    { label: "Sequence", value: (r) => r.sequence },
  ];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <WebLayout crumb="Reporting / History" title="Guard Post History" requiredModule="Reports & Audit Trail">
      <Card title="Filter">
        <div className="flex items-end gap-3">
          <div className="w-72">
            <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Guard Post</label>
            <Select value={postId} onChange={(e) => setPostId(e.target.value)}>
              <option value="all">All Guard Posts</option>
              {posts.map((p) => (
                <option key={p.id} value={p.backendId}>
                  {p.id} — {p.name}
                </option>
              ))}
            </Select>
          </div>
          <PillButton
            tone="ghost"
            onClick={() => exportToCSV(rows, columns, "guard-post-history.csv")}
            disabled={rows.length === 0}
          >
            Export CSV
          </PillButton>
        </div>
      </Card>

      <Card
        title="Scan History"
        subtitle={total > 0 ? `${total} scan${total === 1 ? "" : "s"} total` : undefined}
      >
        {loading && (
          <div className="py-10 text-center text-[12.5px] text-inkSoft">Loading...</div>
        )}

        {!loading && rows.length === 0 && (
          <div className="py-10 text-center text-[12.5px] text-inkSoft">No history recorded yet.</div>
        )}

        {!loading && rows.length > 0 && (
          <>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                  {columns.map((c) => (
                    <th key={c.label} className="border-b border-border pb-2">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="num border-b border-[#EFF2F5] py-2.5">{formatDate(r.date)}</td>
                    <td className="num border-b border-[#EFF2F5] py-2.5">{formatShortTime(r.time)}</td>
                    <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{r.postName}</td>
                    <td className="border-b border-[#EFF2F5] py-2.5">{r.officer}</td>
                    <td className="border-b border-[#EFF2F5] py-2.5">
                      <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                    </td>
                    <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">{r.delay}</td>
                    <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">{r.sequence}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-[12px] text-inkSoft">
                <PillButton
                  tone="ghost"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </PillButton>
                <span>
                  Page {page} of {totalPages}
                </span>
                <PillButton
                  tone="ghost"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </PillButton>
              </div>
            )}
          </>
        )}
      </Card>
    </WebLayout>
  );
}