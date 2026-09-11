import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import {
  Card,
  PillButton,
  Toggle,
  Field,
  TextInput,
  TextArea,
} from "../../components/web/FormField";
import Badge from "../../components/web/Badge";
import Modal from "../../components/web/Modal";
import { useData } from "../../context/DataContext";
import { ZONES } from "../../lib/mockData";
import { formatDate } from "../../lib/utils";
import { useNavigate } from "react-router-dom";

const emptyForm = {
  name: "",
  zone: ZONES[0],
  location: "",
  gps: "",
  notes: "",
};

// "28.6139, 77.2090" style only - two numbers separated by a comma.
// Matches the backend's gps_lat/gps_lng columns exactly:
// db.Numeric(9, 6) = 9 total digits, 6 after the decimal point,
// which leaves at most 3 digits before it. Empty string is allowed
// (GPS is optional).
const GPS_REGEX = /^-?\d{1,3}(\.\d{1,6})?\s*,\s*-?\d{1,3}(\.\d{1,6})?$/;

function parseGpsInput(rawGps) {
  const trimmed = (rawGps || "").trim();

  if (!trimmed) {
    return { gps: null, error: null };
  }

  if (!GPS_REGEX.test(trimmed)) {
    return {
      gps: null,
      error:
        "GPS coordinates must be two comma-separated numbers with up to 3 digits before and 6 digits after the decimal point, e.g. 28.6139, 77.2090",
    };
  }

  const [latStr, lngStr] = trimmed.split(",").map((part) => part.trim());

  // Round to 6 decimal places to avoid float rounding drift (e.g.
  // 77.209000000001) before it ever reaches the Numeric(9,6) column.
  const lat = Number(Number(latStr).toFixed(6));
  const lng = Number(Number(lngStr).toFixed(6));

  return {
    gps: { lat, lng },
    error: null,
  };
}

// Inverse of parseGpsInput - state stores gps as { lat, lng } (see
// DataContext's post mapping), but the text field needs a plain
// "lat, lng" string. Without this, dropping the object straight into
// the input renders literally as "[object Object]".
function formatGpsForInput(gps) {
  if (!gps || typeof gps !== "object") {
    return "";
  }

  const { lat, lng } = gps;

  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return "";
  }

  return `${lat}, ${lng}`;
}

export default function GuardPosts() {
  const { posts, webSession, actions } = useData();
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const canEdit = webSession?.role === "Administrator";

  // Fetch fresh guard posts every time this page mounts (not just
  // once at login), same fix applied to Officer Management - so
  // switching panels always hits the backend and shows up in the
  // server logs without needing a full page refresh.
  //
  // We also fetch QR codes right after, and wait for loadPosts()
  // to resolve first. loadQRCodes() matches each QR record to a
  // post already sitting in state and marks that post's
  // `qrGenerated` flag - if it runs before posts are loaded (or
  // is never called at all, as before), it has nothing to match
  // against, so the QR Status column falls back to "Unassigned"
  // for every row even when a QR code actually exists in the
  // backend. QR Code Management already calls loadQRCodes() on
  // mount, which is why that page shows correct QR status while
  // this one didn't.
  useEffect(() => {
    async function refreshPostsAndQRStatus() {
      if (!webSession?.accessToken) return;

      await actions.loadPosts();
      await actions.loadQRCodes();
    }

    refreshPostsAndQRStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  const editingPost = editingId
    ? posts.find((p) => p.id === editingId)
    : null;

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(post) {
    setEditingId(post.id);

    setForm({
      name: post.name,
      zone: post.zone,
      location: post.location,
      gps: formatGpsForInput(post.gps),
      notes: post.notes || "",
    });

    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();

    if (!form.name.trim()) return;

    const { gps, error: gpsError } = parseGpsInput(form.gps);

    if (gpsError) {
      alert(gpsError);
      return;
    }

    const payload = { ...form, gps };

    try {
      let result;

      if (editingId) {
        result = await actions.updatePost(editingId, payload);
      } else {
        result = await actions.addPost(payload);
      }

      if (!result?.ok) {
        alert(
          result?.error ||
            "Unable to save guard post."
        );
        return;
      }

      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      console.error(
        "Guard post save error:",
        error
      );

      alert(
        "Unable to connect to guard post API."
      );
    }
  }

  async function handleToggleActive(post) {
    const confirmMessage = post.active
      ? `Mark ${post.name} as inactive?`
      : `Mark ${post.name} as active?`;

    if (!window.confirm(confirmMessage)) return;

    const result = await actions.togglePostActive(post.id);

    if (!result?.ok) {
      alert(
        result?.error ||
          "Unable to update guard post status."
      );
    }
  }

  return (
    <WebLayout
      crumb="Configuration / Posts"
      title="Guard Post Management"
      requiredModule="Guard Post Management"
      right={
        canEdit && (
          <PillButton
            tone="accent"
            onClick={openAdd}
          >
            + Add Guard Post
          </PillButton>
        )
      }
    >
      <Card
        title="All Guard Posts"
        subtitle={`${posts.length} posts`}
      >
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
              <th className="border-b border-border pb-2">
                Post ID
              </th>

              <th className="border-b border-border pb-2">
                Post Name / Location
              </th>

              <th className="border-b border-border pb-2">
                QR Status
              </th>

              <th className="border-b border-border pb-2">
                Status
              </th>

              <th className="border-b border-border pb-2">
                Created
              </th>

              <th className="border-b border-border pb-2">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">
                  {p.id}
                </td>

                <td className="border-b border-[#EFF2F5] py-2.5">
                  <div className="font-semibold text-ink">
                    {p.name}
                  </div>

                  <div className="text-[11px] text-inkSoft">
                    {p.location}
                  </div>
                </td>

                <td className="border-b border-[#EFF2F5] py-2.5">
                  <Badge
                    tone={
                      p.qrGenerated
                        ? "green"
                        : "gray"
                    }
                  >
                    {p.qrGenerated
                      ? "Assigned"
                      : "Unassigned"}
                  </Badge>
                </td>

                <td className="border-b border-[#EFF2F5] py-2.5">
                  <Toggle
                    checked={p.active}
                    disabled={!canEdit}
                    onChange={() => handleToggleActive(p)}
                  />
                </td>

                <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                  {formatDate(p.createdAt)}
                </td>

                <td className="border-b border-[#EFF2F5] py-2.5">
                  <div className="flex gap-3 text-[11.5px] font-bold text-accent-dark">
                    {canEdit && (
                      <button
                        onClick={() =>
                          openEdit(p)
                        }
                      >
                        Edit
                      </button>
                    )}

                    {p.active && (
                      <button
                        onClick={() =>
                          navigate("/web/qr", {
                            state: { postId: p.id },
                          })
                        }
                      >
                        QR
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {posts.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-6 text-center text-[12px] text-inkSoft"
                >
                  No guard posts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() =>
          setModalOpen(false)
        }
        title={
          editingId
            ? "Edit Guard Post"
            : "Add Guard Post"
        }
      >
        <form onSubmit={handleSave}>
          <Field label="Post Name">
            <TextInput
              required
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
            />
          </Field>

          <Field label="Location Description">
            <TextInput
              value={form.location}
              onChange={(e) =>
                setForm({
                  ...form,
                  location:
                    e.target.value,
                })
              }
            />
          </Field>

          <Field
            label="GPS Coordinates (optional)"
            hint="e.g. 28.6139, 77.2090"
          >
            <TextInput
              value={form.gps}
              onChange={(e) =>
                setForm({
                  ...form,
                  gps: e.target.value.replace(/[^0-9.,\-\s]/g, ""),
                })
              }
            />
          </Field>

          <Field label="Notes">
            <TextArea
              rows={2}
              value={form.notes}
              onChange={(e) =>
                setForm({
                  ...form,
                  notes: e.target.value,
                })
              }
            />
          </Field>

          <PillButton
            tone="accent"
            type="submit"
            className="w-full justify-center"
          >
            {editingId
              ? "Save Changes"
              : "Add Guard Post"}
          </PillButton>
        </form>
      </Modal>
    </WebLayout>
  );
}