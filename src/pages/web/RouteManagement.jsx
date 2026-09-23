import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import {
  Card,
  PillButton,
  Select,
  TextInput,
  Toggle,
  Field,
} from "../../components/web/FormField";
import Modal from "../../components/web/Modal";
import { useData } from "../../context/DataContext";

const emptyRouteForm = {
  name: "",
  enforceSequence: false,
};

export default function RouteManagement() {
  const { webSession, routes, routePosts, posts, actions } = useData();
  const canEdit =
    webSession?.role === "Administrator" || webSession?.role === "Supervisor";

  const [selectedId, setSelectedId] = useState(null);
  const selectedRoute = routes.find((r) => r.id === selectedId) || null;
  const selectedRoutePosts = routePosts
    .filter((rp) => rp.route_id === selectedId)
    .slice()
    .sort((a, b) => a.sequence_no - b.sequence_no);

  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadRoutes();
    actions.loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  useEffect(() => {
    if (selectedId) {
      actions.loadRoutePosts(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* =========================================================
     ROUTES
  ========================================================= */

  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [routeForm, setRouteForm] = useState(emptyRouteForm);
  const [savingRoute, setSavingRoute] = useState(false);

  function openAddRoute() {
    setEditingRouteId(null);
    setRouteForm(emptyRouteForm);
    setRouteModalOpen(true);
  }

  function openEditRoute(route) {
    setEditingRouteId(route.id);
    setRouteForm({
      name: route.name || "",
      enforceSequence: Boolean(route.enforce_sequence),
    });
    setRouteModalOpen(true);
  }

  function closeRouteModal() {
    if (savingRoute) return;
    setRouteModalOpen(false);
    setEditingRouteId(null);
    setRouteForm(emptyRouteForm);
  }

  async function handleSaveRoute(e) {
    e.preventDefault();

    if (!routeForm.name.trim()) {
      alert("Route name is required.");
      return;
    }

    setSavingRoute(true);

    try {
      const result = editingRouteId
        ? await actions.updateRoute(editingRouteId, routeForm)
        : await actions.createRoute(routeForm);

      if (!result?.ok) {
        alert(result?.error || "Unable to save route.");
        return;
      }

      if (!editingRouteId && result.route?.id) {
        setSelectedId(result.route.id);
      }

      closeRouteModal();
    } catch (error) {
      console.error("Save route error:", error);
      alert("Unable to connect to Routes API.");
    } finally {
      setSavingRoute(false);
    }
  }

  async function handleToggleRouteActive(route) {
    const confirmMessage = route.active
      ? `Mark "${route.name}" as inactive?`
      : `Mark "${route.name}" as active?`;

    if (!window.confirm(confirmMessage)) return;

    const result = await actions.toggleRouteActive(route.id);
    if (!result?.ok) {
      alert(result?.error || "Unable to update route status.");
    }
  }

  /* =========================================================
     ROUTE POSTS
  ========================================================= */

  const [addPostId, setAddPostId] = useState("");
  const [savingPost, setSavingPost] = useState(false);

  const availablePostsForRoute = posts.filter(
    (p) => !selectedRoutePosts.some((rp) => Number(rp.post_id) === Number(p.backendId ?? p.id))
  );

  async function handleAddPost(e) {
    e.preventDefault();
    if (!selectedId || !addPostId) return;

    setSavingPost(true);
    try {
      const post = posts.find((p) => p.id === addPostId);
      const result = await actions.addRoutePost(selectedId, {
        post_id: post?.backendId ?? addPostId,
      });

      if (!result?.ok) {
        alert(result?.error || "Unable to add post to route.");
        return;
      }

      setAddPostId("");
    } catch (error) {
      console.error("Add route post error:", error);
      alert("Unable to connect to Routes API.");
    } finally {
      setSavingPost(false);
    }
  }

  async function handleRemovePost(routePost) {
    if (!window.confirm("Remove this post from the route?")) return;

    const result = await actions.removeRoutePost(selectedId, routePost.id);
    if (!result?.ok) {
      alert(result?.error || "Unable to remove post.");
    }
  }

  async function handleMovePost(routePost, direction) {
    const index = selectedRoutePosts.findIndex((rp) => rp.id === routePost.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= selectedRoutePosts.length) return;

    const reordered = selectedRoutePosts.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, moved);

    const order = reordered.map((rp, i) => ({
      route_post_id: rp.id,
      sequence_no: i + 1,
    }));

    const result = await actions.reorderRoutePosts(selectedId, order);
    if (!result?.ok) {
      alert(result?.error || "Unable to reorder posts.");
    }
  }

  function postName(postId) {
    const post = posts.find(
      (p) => Number(p.backendId ?? p.id) === Number(postId)
    );
    return post?.name || `Post #${postId}`;
  }

  return (
    <WebLayout
      crumb="Configuration / Routes"
      title="Route Management"
      requiredModule="Round & Route Management"
    >
      <div className="grid grid-cols-[1fr_1.3fr] gap-4">
        <Card
          title="Routes"
          subtitle={`${routes.length} route${routes.length === 1 ? "" : "s"}`}
          right={
            canEdit && (
              <PillButton tone="accent" onClick={openAddRoute}>
                + Add Route
              </PillButton>
            )
          }
        >
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Route Name</th>
                <th className="border-b border-border pb-2">Sequence</th>
                <th className="border-b border-border pb-2">Status</th>
                <th className="border-b border-border pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr
                  key={r.id}
                  className={r.id === selectedId ? "bg-status-grayBg" : ""}
                >
                  <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">
                    <button
                      className="text-left"
                      onClick={() => setSelectedId(r.id)}
                    >
                      {r.name}
                    </button>
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {r.enforce_sequence ? "Enforced" : "Any order"}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={r.active}
                        disabled={!canEdit}
                        onChange={() => handleToggleRouteActive(r)}
                      />
                      <span className="text-[11px] text-inkSoft">
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    {canEdit && (
                      <button
                        className="text-[11.5px] font-bold text-accent-dark"
                        onClick={() => openEditRoute(r)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {routes.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[12px] text-inkSoft">
                    No routes defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card
          title={selectedRoute ? `Posts on "${selectedRoute.name}"` : "Route Posts"}
          subtitle={
            selectedRoute
              ? `${selectedRoutePosts.length} post${selectedRoutePosts.length === 1 ? "" : "s"}, in order`
              : "Select a route to manage its posts"
          }
        >
          {!selectedRoute && (
            <div className="py-8 text-center text-[12px] text-inkSoft">
              Click a route on the left to view and order its guard posts.
            </div>
          )}

          {selectedRoute && (
            <>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                    <th className="border-b border-border pb-2">#</th>
                    <th className="border-b border-border pb-2">Guard Post</th>
                    <th className="border-b border-border pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRoutePosts.map((rp, index) => (
                    <tr key={rp.id}>
                      <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                        {rp.sequence_no}
                      </td>
                      <td className="border-b border-[#EFF2F5] py-2.5 font-semibold text-ink">
                        {postName(rp.post_id)}
                      </td>
                      <td className="border-b border-[#EFF2F5] py-2.5">
                        {canEdit && (
                          <div className="flex gap-2 text-[11.5px] font-bold text-accent-dark">
                            <button
                              disabled={index === 0}
                              onClick={() => handleMovePost(rp, -1)}
                            >
                              ↑
                            </button>
                            <button
                              disabled={index === selectedRoutePosts.length - 1}
                              onClick={() => handleMovePost(rp, 1)}
                            >
                              ↓
                            </button>
                            <button onClick={() => handleRemovePost(rp)}>
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}

                  {selectedRoutePosts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-[12px] text-inkSoft">
                        No posts added to this route yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {canEdit && (
                <form onSubmit={handleAddPost} className="mt-4 flex items-end gap-3">
                  <Field label="Add Guard Post" className="flex-1">
                    <Select
                      value={addPostId}
                      onChange={(e) => setAddPostId(e.target.value)}
                    >
                      <option value="" disabled>
                        Select a post
                      </option>
                      {availablePostsForRoute.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <PillButton
                    tone="accent"
                    type="submit"
                    disabled={!addPostId || savingPost}
                  >
                    {savingPost ? "Adding..." : "Add"}
                  </PillButton>
                </form>
              )}
            </>
          )}
        </Card>
      </div>

      <Modal
        open={routeModalOpen}
        onClose={closeRouteModal}
        title={editingRouteId ? "Edit Route" : "Add Route"}
      >
        <form onSubmit={handleSaveRoute}>
          <Field label="Route Name">
            <TextInput
              required
              value={routeForm.name}
              onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
              placeholder="e.g. Perimeter Route"
            />
          </Field>

          <Field
            label="Enforce Sequence"
            hint="If on, posts on this route must be scanned in order."
          >
            <div className="flex items-center gap-2">
              <Toggle
                checked={routeForm.enforceSequence}
                onChange={() =>
                  setRouteForm({
                    ...routeForm,
                    enforceSequence: !routeForm.enforceSequence,
                  })
                }
              />
              <span className="text-[11px] text-inkSoft">
                {routeForm.enforceSequence ? "Enforced" : "Any order"}
              </span>
            </div>
          </Field>

          <div className="flex gap-3">
            <PillButton
              type="button"
              onClick={closeRouteModal}
              className="w-full justify-center"
              disabled={savingRoute}
            >
              Cancel
            </PillButton>

            <PillButton
              tone="accent"
              type="submit"
              className="w-full justify-center"
              disabled={savingRoute}
            >
              {savingRoute ? "Saving..." : editingRouteId ? "Save Changes" : "Add Route"}
            </PillButton>
          </div>
        </form>
      </Modal>
    </WebLayout>
  );
}