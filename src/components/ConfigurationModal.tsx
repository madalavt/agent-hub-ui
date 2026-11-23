"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, ErrorBanner, Field, Input, Modal, Select } from "@/components/ui";
import { dt, fetcher } from "@/lib/api";
import { canWriteCustomer, useSession } from "@/lib/session";
import type { Project, TreeGraph, TreeSummary } from "@/lib/types";

const NEW_TREE = "__new__";

// A decision tree configuration in the org's Decision Tree Library (v1 igpt configuration): a
// name, a decision tree from the org's library, and the integer id automations upload to.
// Stored as an Agent Hub "project" in the decision-tree API; unrelated to the org's projects
// (work items), which pick a configuration only in automation code.
export function ConfigurationModal({
  open,
  onClose,
  onSaved,
  customerId,
  project,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (p: Project, isNew: boolean) => void;
  customerId: string;
  project?: Project;
}) {
  const trees = useSWR<TreeSummary[]>(open ? `dt:/v1/trees?customer_id=${customerId}` : null, fetcher);
  const me = useSession().data;
  const canCreate = me?.role === "admin" || canWriteCustomer(me, customerId);
  const [form, setForm] = useState<{ name: string; description: string; tree: string }>({
    name: "",
    description: "",
    tree: "",
  });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const key = project?.id ?? "new";
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    setForm({ name: project?.name ?? "", description: project?.description ?? "", tree: project?.tree_id ?? "" });
    setError(null);
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    let createdTreeId: string | null = null;
    try {
      let treeId: string | null = form.tree || null;
      if (form.tree === NEW_TREE) {
        const t = await dt.post<TreeGraph>("/v1/trees", { name: `${form.name} tree`, customer_id: customerId, nodes: [], branches: [] });
        treeId = createdTreeId = t.id;
      } else if (form.tree.startsWith("copy:")) {
        const t = await dt.post<TreeGraph>(`/v1/trees/${form.tree.slice(5)}/duplicate?customer_id=${customerId}`);
        createdTreeId = t.id;
        const renamed = { ...t, name: `${form.name} tree` };
        await dt.put(`/v1/trees/${t.id}`, renamed);
        treeId = t.id;
      }
      const body = { name: form.name, description: form.description || null, tree_id: treeId };
      const saved = project
        ? await dt.patch<Project>(`/v1/projects/${project.id}`, body)
        : await dt.post<Project>(`/v1/customers/${customerId}/projects`, body);
      onSaved(saved, !project);
    } catch (e) {
      if (createdTreeId) await dt.del(`/v1/trees/${createdTreeId}`).catch(() => {});
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Edit decision tree" : "New decision tree"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!form.name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={error} />
      <Field label="Name">
        <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mortgage Change" />
      </Field>
      <Field label="Description">
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <Field label="Decision tree" hint="Runs on every document an automation uploads to this configuration. Trees come from your org's library.">
        <Select value={form.tree} onChange={(e) => setForm({ ...form, tree: e.target.value })}>
          <option value="">— None —</option>
          {canCreate && <option value={NEW_TREE}>+ Create a new empty tree</option>}
          <optgroup label="Use an existing tree">
            {trees.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.node_count} nodes)
              </option>
            ))}
          </optgroup>
          {canCreate && (
          <optgroup label="Start from a copy of">
            {trees.data?.map((t) => (
              <option key={`c-${t.id}`} value={`copy:${t.id}`}>
                Copy of {t.name}
              </option>
            ))}
          </optgroup>
          )}
        </Select>
      </Field>
    </Modal>
  );
}
