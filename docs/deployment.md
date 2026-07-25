# Deploying `jobber-auth` with Docker

> How to package a NestJS service from this Nx monorepo into a small, production-ready Docker image — using the build tooling that `create-nx-workspace` already set up for you.

See also: [architecture.md](./architecture.md) for how the workspace and its build targets fit together.

---

## Table of Contents

1. [The core challenge (and how Nx solves it)](#1-the-core-challenge-and-how-nx-solves-it)
2. [The pieces already in your repo](#2-the-pieces-already-in-your-repo)
3. [Build & prune flow](#3-build--prune-flow)
4. [The Dockerfile](#4-the-dockerfile)
5. [.dockerignore](#5-dockerignore)
6. [Build & run](#6-build--run)
7. [Why multi-stage + prune keeps the image small](#7-why-multi-stage--prune-keeps-the-image-small)
8. [Configuration & environment](#8-configuration--environment)
9. [docker-compose for local development](#9-docker-compose-for-local-development)
10. [CI: building images for affected services only](#10-ci-building-images-for-affected-services-only)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. The core challenge (and how Nx solves it)

In a monorepo there's **one** `package.json` and **one** lockfile at the root, shared by every project. But a Docker image for `jobber-auth` should contain *only* the dependencies that service actually uses — not the union of every service's dependencies.

Nx solves this with two mechanisms that are **already configured** in this repo:

| Mechanism | What it does |
|---|---|
| `generatePackageJson: true` (in `webpack.config.js`) | When webpack builds, it emits a `package.json` in `dist/` listing **only** the runtime deps `jobber-auth` imports. |
| `prune-lockfile` + `copy-workspace-modules` targets (in `project.json`) | Produce a matching pruned `package-lock.json` and copy any local workspace libs, so `npm ci` inside the image installs a minimal, reproducible dependency set. |

The result: your image installs a handful of packages, not the entire workspace's dependency tree.

---

## 2. The pieces already in your repo

You don't need to add build config — the preset created it. For reference:

**`apps/jobber-auth/webpack.config.js`** — note `generatePackageJson: true`:

```js
new NxAppWebpackPlugin({
  target: 'node',
  compiler: 'tsc',
  main: './src/main.ts',
  tsConfig: './tsconfig.app.json',
  assets: ['./src/assets'],
  generatePackageJson: true,   // ← emits a lean package.json into dist/
  outputHashing: 'none',
})
```

**`apps/jobber-auth/project.json`** — the prune pipeline:

```
prune ──▶ prune-lockfile ──────▶ build
      └──▶ copy-workspace-modules ──▶ build
```

Running `nx prune jobber-auth` builds the app, then writes to `dist/apps/jobber-auth/`:

```
dist/apps/jobber-auth/
├── main.js                  # bundled app
├── assets/                  # copied static assets
├── package.json             # pruned: only jobber-auth's runtime deps
├── package-lock.json        # pruned lockfile (reproducible installs)
└── workspace_modules/       # any local libs jobber-auth depends on
```

That directory is exactly what the Docker image needs.

---

## 3. Build & prune flow

```mermaid
flowchart TD
    A["nx prune jobber-auth"] --> B["build (webpack-cli)"]
    B --> C["dist/.../main.js + assets/"]
    B --> D["dist/.../package.json<br/>(generatePackageJson)"]
    D --> E["prune-lockfile<br/>→ pruned package-lock.json"]
    B --> F["copy-workspace-modules<br/>→ workspace_modules/"]
    E --> G["prune (noop: ties it together)"]
    F --> G
    C --> H["Docker build context:<br/>dist/apps/jobber-auth"]
    G --> H
```

---

## 4. The Dockerfile

Place this at `apps/jobber-auth/Dockerfile`. It's **multi-stage**: stage 1 builds inside the full workspace; stage 2 is a slim runtime image containing only the pruned output + production deps.

```dockerfile
# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder
WORKDIR /workspace

# Install all workspace deps (needed to build). Copy manifests first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and produce the pruned dist output.
COPY . .
RUN npx nx prune jobber-auth

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copy only the pruned build output from the builder stage.
COPY --from=builder /workspace/dist/apps/jobber-auth ./

# Install only this service's production dependencies using the pruned lockfile.
RUN npm ci --omit=dev && npm cache clean --force

# Run as a non-root user for safety (the node image ships a 'node' user).
USER node

EXPOSE 3000
CMD ["node", "main.js"]
```

> **Node version:** the base images use `node:22-alpine` to match your `@types/node: ^22` devDependency. Adjust if you standardize on a different runtime.

---

## 5. .dockerignore

Put this at the **repo root** as `.dockerignore` so the build context stays small and fast (the builder stage does a fresh `npm ci` anyway):

```
node_modules
dist
tmp
.nx
.git
.github
.vscode
**/*.spec.ts
**/*.test.ts
coverage
*.log
```

---

## 6. Build & run

From the **repo root** (the Dockerfile's build context is the whole workspace, because stage 1 needs `nx`):

```bash
# Build the image
docker build -f apps/jobber-auth/Dockerfile -t jobber-auth:latest .

# Run it (maps container :3000 to host :3000)
docker run --rm -p 3000:3000 --env PORT=3000 jobber-auth:latest

# The service is now at:
#   http://localhost:3000/api
```

Health-check it:

```bash
curl http://localhost:3000/api
```

---

## 7. Why multi-stage + prune keeps the image small

```mermaid
graph LR
    subgraph Builder["Stage 1: builder (discarded)"]
        FULL["full source + ALL workspace<br/>node_modules + nx + webpack"]
    end
    subgraph Runner["Stage 2: runner (shipped)"]
        LEAN["main.js + assets +<br/>only jobber-auth prod deps"]
    end
    FULL -->|"copy dist/apps/jobber-auth only"| LEAN
```

- The heavy toolchain (Nx, webpack, TypeScript, every dev dependency, all other services' deps) lives **only** in the builder stage, which is thrown away.
- The final image carries just the bundled `main.js`, static assets, and the **pruned** production dependency set from `generatePackageJson` + `prune-lockfile`.
- `USER node` runs the process unprivileged; `NODE_ENV=production` disables dev-only behavior.

---

## 8. Configuration & environment

`main.ts` reads `PORT` (default `3000`) and serves everything under the `/api` prefix. Pass config at run time rather than baking it into the image:

```bash
docker run --rm -p 8080:8080 \
  --env PORT=8080 \
  --env DATABASE_URL=postgres://... \
  --env JWT_SECRET=... \
  jobber-auth:latest
```

> Never bake secrets into the image or the Dockerfile. Inject them at runtime via `--env` / `--env-file`, an orchestrator's secret store, or a mounted file.

---

## 9. docker-compose for local development

A `compose.yaml` at the repo root is handy once the auth service gains a database. Example wiring `jobber-auth` to Postgres:

```yaml
services:
  jobber-auth:
    build:
      context: .
      dockerfile: apps/jobber-auth/Dockerfile
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      DATABASE_URL: postgres://jobber:jobber@postgres:5432/jobber
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: jobber
      POSTGRES_PASSWORD: jobber
      POSTGRES_DB: jobber
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```bash
docker compose up --build
```

---

## 10. CI: building images for affected services only

As `jobber` grows into multiple services, you don't want to rebuild every image on every commit. Combine Nx `affected` with Docker so CI only builds images for services impacted by the diff:

```bash
# List apps affected by the current change
nx show projects --affected --type app --base=origin/main

# ...then build a Docker image for each one in the list.
```

```mermaid
flowchart LR
    A["git diff vs. main"] --> B["nx affected<br/>(which apps changed?)"]
    B --> C{"jobber-auth<br/>affected?"}
    C -- "Yes" --> D["docker build + push<br/>jobber-auth"]
    C -- "No" --> E["Skip — reuse existing image"]
```

A convenient pattern is to add a per-project `docker-build` target to `project.json` later, so `nx affected -t docker-build` fans out across exactly the affected services.

---

## 11. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `Cannot find module 'main.js'` at container start | The `CMD` runs from `/app`; confirm `dist/apps/jobber-auth/main.js` exists after `nx prune` and that stage 2 copies into `./`. |
| `npm ci` fails in stage 2 | The pruned `package-lock.json` must be present in `dist/`. Ensure `nx prune` (not just `nx build`) ran, so `prune-lockfile` executed. |
| Image is huge | Confirm the multi-stage split — the final `FROM` must not `COPY` the workspace `node_modules`. Only copy `dist/apps/jobber-auth`. |
| App starts but routes 404 | Remember the global `/api` prefix — hit `http://localhost:3000/api/...`, not the bare root. |
| Local libs missing at runtime | They live in `workspace_modules/` from `copy-workspace-modules`; the generated `package.json` references them. Make sure the whole `dist/apps/jobber-auth` dir is copied, not just `main.js`. |
| Build can't find `nx` | Stage 1 must run `npm ci` on the **root** `package.json` before `npx nx prune` — Nx is a root devDependency. |

---

### Quick reference

```bash
nx prune jobber-auth                                             # produce deployable dist/
docker build -f apps/jobber-auth/Dockerfile -t jobber-auth .     # build image
docker run --rm -p 3000:3000 jobber-auth                         # run → http://localhost:3000/api
docker compose up --build                                        # run with dependencies
```
