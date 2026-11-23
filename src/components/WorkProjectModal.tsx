"use client";

// Create or rename a tenant's project (v1 roots-auth project). A new project gets its own work
// item queue first (work item manager), then the project is created with that queue_id. A
// project has no decision tree: automations choose a tree configuration in code.

import { useState } from "react";
import { Button, ErrorBanner, Field, Input, Modal } from "@/components/ui";
import { ra, wi } from "@/lib/api";
import type { Customer, TenantProject } from "@/lib/types";

export function WorkProjectModal({
  open,
  onClose,
  onSaved,
  customer,
  project,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (p: TenantProject, isNew: boolean) => void;
  customer: Customer;
  project?: TenantProject;
}) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const key = project?.project_id ?? "new";
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    setForm({ name: project?.display_name ?? "", description: project?.description ?? "" });
    setError(null);
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const name = form.name.trim();
    const description = form.description.trim() || null;
    try {
      if (project) {
        const saved = await ra.put<TenantProject>(`/tenant/${customer.id}/projects/${project.project_id}`, {
          display_name: name,
          description,
        });
        onSaved(saved, false);
        return;
      }
      // Queue names are unique across orgs, so the org's name prefixes it (like v1's queues).
      const queue = await wi.post<{ queueId: string }>("/queues", {
        queueName: `${customer.name} - ${name}`,
        description,
        tenantId: customer.id,
        rootsId: "KEY",
      });
      try {
        const saved = await ra.post<TenantProject>(`/tenant/${customer.id}/projects`, {
          display_name: name,
          description,
          queue_id: queue.queueId,
        });
        onSaved(saved, true);
      } catch (projectErr) {
        // Avoid leaving an orphaned queue that blocks retrying with the same project name.
        await wi.del(`/queues/${queue.queueId}`).catch(() => {});
        throw projectErr;
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Edit project" : "New project"}
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
      {!project && (
        <p className="text-xs text-slate-500">
          The project gets its own work item queue. Decision trees live in the Decision Tree Library; automations choose one when they
          upload a document.
        </p>
      )}
    </Modal>
  );
}
