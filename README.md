# Agent Hub Web UI (`agent-hub-ui`)

[![Next.js 15](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8.svg)](https://tailwindcss.com)
[![XYFlow](https://img.shields.io/badge/XYFlow-React_Flow-ff0072.svg)](https://reactflow.dev)

**`agent-hub-ui`** is the full-stack web dashboard, visual workflow builder, and API gateway for the **Agent Hub** platform. Built with **Next.js 15**, **React 19**, **Tailwind CSS**, and **@xyflow/react**, it provides an intuitive, high-performance user experience for configuring decision trees, monitoring automation queues, and performing human-in-the-loop document reviews.

---

## Key Features

- **Visual Decision Tree Studio**:
  - Drag-and-drop interactive DAG editor powered by `@xyflow/react`.
  - Visual inspection and editing of classification nodes, extraction prompts, output schema fields, and conditional routing edges.
  - Test and preview tree branches directly within the UI.
- **Work Item Queue Operations Dashboard**:
  - Live task queue views: monitor active, pending, and completed automation jobs.
  - Detailed task breakdown: inspection of item tags, payloads, execution attempts, and bot leases.
  - Manual intervention triggers: re-queue failed tasks, unlock hung leases, or complete items with custom statuses.
- **Document Review & Annotation Studio**:
  - Split-screen document inspection: side-by-side view of source document pages and extracted structured data.
  - Interactive bounding boxes: visually highlights extraction coordinates directly on the document image canvas.
  - Single-click approval, rejection, or field value correction.
- **Unified Microservice API Gateway**:
  - Next.js server-side route proxies forward browser requests seamlessly to backend services (`agent-hub-api`, `agent-hub-extraction`, `agent-hub-work-items`, `agent-hub-annotations`).
  - Eliminates browser CORS issues and centralizes header/token injection.
- **System Health & Observability**:
  - Real-time dependency health dashboard (`/status` and `/api/health`) reporting database connectivity, storage status, and worker heartbeat across all microservices.

---

## Tech Stack

- **Framework**: Next.js 15 (App Router, Server Actions, Route Handlers)
- **Library**: React 19
- **Flow / Graph Editor**: `@xyflow/react`
- **Data Fetching & Caching**: SWR
- **Styling**: Tailwind CSS & Lucide Icons
- **Deployment**: Docker standalone multi-stage container

---

## Architecture Overview

```
                      +-----------------------------+
                      |       Web Browser           |
                      +--------------+--------------+
                                     |
                                 Port 3000
                                     v
+-------------------------------------------------------------------------+
|                         agent-hub-ui (Next.js)                          |
|                                                                         |
|  +---------------------+  +---------------------+  +-----------------+  |
|  |  Decision Tree Flow |  |  Work Item Queues   |  |  Doc Annotation |  |
|  +---------------------+  +---------------------+  +-----------------+  |
|                                                                         |
|  [ API Gateway Proxy Routes: /api/proxy/*, /api/roots-queue/*, etc. ]    |
+----+-------------------+-------------------+--------------------+-------+
     |                   |                   |                    |
     v (Port 8001)       v (Port 8002)       v (Port 8003)        v (Port 8004)
+---------+         +------------+      +------------+       +-------------+
|   api   |         | extraction |      | work-items |       | annotations |
+---------+         +------------+      +------------+       +-------------+
```

---

## Getting Started

### Prerequisites
- **Node.js 20+** or **Node.js 22**
- **npm** or **pnpm**

### 1. Local Development

```bash
# Clone the repository
git clone https://github.com/madalavt/agent-hub-ui.git
cd agent-hub-ui

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Running with Docker

```bash
# Build standalone Docker image
docker build -t agent-hub-ui .

# Run container
docker run -d \
  --name agent-hub-ui \
  -p 3000:3000 \
  -e DECISION_TREE_API_URL="http://host.docker.internal:8001" \
  -e EXTRACTION_API_URL="http://host.docker.internal:8002" \
  -e WORK_ITEMS_API_URL="http://host.docker.internal:8003" \
  -e ANNOTATIONS_API_URL="http://host.docker.internal:8004" \
  agent-hub-ui
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the UI server listens on |
| `DECISION_TREE_API_URL`| `http://localhost:8001` | URL of `agent-hub-api` |
| `EXTRACTION_API_URL` | `http://localhost:8002` | URL of `agent-hub-extraction` |
| `WORK_ITEMS_API_URL` | `http://localhost:8003` | URL of `agent-hub-work-items` |
| `ANNOTATIONS_API_URL` | `http://localhost:8004` | URL of `agent-hub-annotations` |
| `EXTRACTION_API_KEY` | `""` | Internal API key forwarded to extraction service |
| `WORK_ITEMS_API_KEY` | `""` | Internal API key forwarded to work-items service |
| `ANNOTATIONS_API_KEY` | `""` | Internal API key forwarded to annotations service |

---

## Quality Checks & Building

```bash
# Type check TypeScript files
npm run typecheck

# Production build
npm run build
```

---

## License

This project is licensed under the Apache 2.0 / MIT License.
