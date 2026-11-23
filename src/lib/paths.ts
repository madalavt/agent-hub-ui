// Page URLs, scoped by tenant (customer) and project like v1:
//   /orgs/{tenant}/projects                                    Home (the tenant's projects)
//   /orgs/{tenant}/projects/{project}/workitems                work items (?page&pageSize)
//   .../workitems/{traceId}/details | /documents               one work item
//   .../workitems/{traceId}/documents/{packageId}              a document's summary
//   /orgs/{tenant}/projects/{project}/documents                the project's documents
//   /orgs/{tenant}/projects/{project}/premium-steps/document-processing   decision tree library

export function tenantHome(tenant: string): string {
  return `/orgs/${tenant}/projects`;
}

export function projectPaths(tenant: string, project: string) {
  const base = `/orgs/${tenant}/projects/${project}`;
  return {
    home: tenantHome(tenant),
    workitems: `${base}/workitems`,
    item: (traceId: string, view: "details" | "documents" = "details") => `${base}/workitems/${traceId}/${view}`,
    document: (traceId: string, packageId: number | string) => `${base}/workitems/${traceId}/documents/${packageId}`,
    documents: `${base}/documents`,
    library: `${base}/premium-steps/document-processing`,
  };
}

export type ProjectPaths = ReturnType<typeof projectPaths>;
