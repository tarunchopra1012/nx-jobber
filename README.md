# Jobber

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

An [Nx](https://nx.dev) monorepo of NestJS microservices, each exposing a code-first GraphQL API.

| Project       | What it is                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `jobber-auth` | Owns user accounts and JWT authentication. Backed by its own PostgreSQL database via [Prisma](https://www.prisma.io/) 7. |
| `jobber-jobs` | Discovers and executes jobs. Has no database of its own.                                                                 |
| `libs/nestjs` | Shared GraphQL building blocks (`AbstractModel`, `GqlContext`), imported as `@jobber/nestjs`.                            |

Each application has a matching `*-e2e` project.

For a deep dive into how the workspace is structured and why, see [docs/architecture.md](docs/architecture.md). The full documentation index lives in [docs/README.md](docs/README.md).

## Prerequisites

- **Node.js** `>=22.12` — enforced by `engines` in `package.json`; `.nvmrc` pins **24**. Required by the Prisma 7 CLI, which fails with `ERR_REQUIRE_ESM` on older releases.
- **Docker** — used to run PostgreSQL locally.

## Getting started

```sh
# 1. Install dependencies
npm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Create a .env file at the repo root with all four required variables
#    (see "Environment variables" below) — jobber-auth will not boot without them

# 4. Apply migrations and generate the Prisma client
npx nx run jobber-auth:migrate-prisma --name=init

# 5. Run a service
npx nx serve jobber-auth   # or: npx nx serve jobber-jobs
```

## Environment variables

Environment variables live in a `.env` file at the **repository root**. It is git-ignored, so each developer creates their own:

```sh
DATABASE_URL=postgres://jobber:jobber@localhost:5432/jobber-auth?schema=public
PORT=3000
JWT_SECRET=replace-me-with-a-long-random-string
JWT_EXPIRATION_MS=3600000
```

| Variable            | Required              | Used by       | Description                                                                         |
| ------------------- | --------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`      | yes                   | `jobber-auth` | PostgreSQL connection string for the auth database.                                 |
| `PORT`              | yes for `jobber-auth` | both services | HTTP port. `jobber-auth` throws if it is unset; `jobber-jobs` falls back to `3001`. |
| `JWT_SECRET`        | yes                   | `jobber-auth` | Signing key for access tokens.                                                      |
| `JWT_EXPIRATION_MS` | yes                   | `jobber-auth` | Token lifetime in milliseconds; also sets the auth cookie's expiry.                 |
| `NODE_ENV`          | no                    | `jobber-auth` | When `production`, the auth cookie is marked `secure`.                              |

Everything marked required is read with `ConfigService.getOrThrow`, so a missing value fails fast at boot rather than surfacing as a confusing error later.

The credentials must match `docker-compose.yml`, which starts a `postgres:latest` container on port `5432` with user `jobber`, password `jobber`, and database `jobber-auth`. The compose service declares no named volume, so `docker compose down` discards the data and you will need to re-run the migrations.

## Database and Prisma

Only `jobber-auth` has a database, and it keeps its Prisma assets inside the app:

| Path                                                | Purpose                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/jobber-auth/prisma/schema.prisma`             | Data model (currently a single `User` model) and generator options.   |
| `apps/jobber-auth/prisma/migrations/`               | Committed SQL migration history.                                      |
| `apps/jobber-auth/prisma.config.ts`                 | Prisma CLI configuration: schema path and the Migrate datasource URL. |
| `apps/jobber-auth/src/app/prisma/prisma.service.ts` | Nest provider extending `PrismaClient` and connecting on module init. |
| `apps/jobber-auth/src/app/prisma/generated/`        | Generated client. Git-ignored, rebuilt by `generate-types`.           |

This workspace runs **Prisma 7**, which behaves quite differently from Prisma 6. If you are following a tutorial or older example and something does not line up, [docs/prisma-6-to-7-migration.md](docs/prisma-6-to-7-migration.md) walks through every breaking change, the error each one produces, and the fix applied here. The short version:

- **`.env` is not auto-loaded.** It is read explicitly in two places, because the CLI and the app are separate processes: `prisma.config.ts` calls `process.loadEnvFile()` on the root `.env` for `generate`/`migrate`, and the running service loads it through `ConfigModule.forRoot({ isGlobal: true })` in `AppModule`.
- **The connection URL no longer lives in `schema.prisma`.** The datasource block only names the provider. For Migrate, `prisma.config.ts` reads it from `process.env.DATABASE_URL` — deliberately _not_ Prisma's `env()` helper, which is strict and would break `generate` in CI where no URL is set. At runtime the URL comes from the driver adapter instead.
- **A driver adapter is mandatory at runtime.** `PrismaService` passes `new PrismaPg({ connectionString: configService.getOrThrow('DATABASE_URL') })` to `super()`; constructing a bare `new PrismaClient()` throws.
- **The generated client is source code, not a package.** The `prisma-client` generator emits raw TypeScript that has to be compiled with the app, so `output` points into `src/` rather than `node_modules`. It is configured with `moduleFormat = "cjs"` and `importFileExtension = ""` so the output fits the CommonJS NestJS build.
- **Node ≥ 22.12 is required**, because `prisma migrate dev` `require()`s an ESM-only dependency. See [Prerequisites](#prerequisites).

Regenerate the client with `npx nx run jobber-auth:generate-types`, and create a migration with `npx nx run jobber-auth:migrate-prisma --name=<migration_name>`. See [Run tasks](#run-tasks) for the full list of targets.

## Run tasks

To run the dev server for an app, use:

```sh
npx nx serve jobber-auth
```

To create a production bundle:

```sh
npx nx build jobber-auth
```

Alongside the generated targets, `jobber-auth` defines two Prisma targets in `apps/jobber-auth/project.json`:

| Target           | Command                                                   | Description                                                                          |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `generate-types` | `npx nx run jobber-auth:generate-types`                   | Runs `prisma generate`. `build` depends on this, so the client is always up to date. |
| `migrate-prisma` | `npx nx run jobber-auth:migrate-prisma --name=add_column` | Runs `prisma migrate dev` with the migration name you pass.                          |

`jobber-jobs` has no database, so it defines neither target.

To see all available targets for a project, run:

```sh
npx nx show project jobber-auth --json
```

Use the `--json` form: several targets are [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) by plugins and never appear in `project.json`. `lint`, for example, exists on every project but is written down nowhere — reading `project.json` alone will give you an incomplete picture.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## TypeScript configuration

`apps/jobber-auth/tsconfig.json` is a solution file that only holds project references. Each reference owns a distinct set of files:

- `tsconfig.app.json` — application sources under `src/`.
- `tsconfig.spec.json` — Jest config and test files.
- `tsconfig.tools.json` — root-level tooling files such as `prisma.config.ts`.

A file that belongs to none of these is type-checked with default compiler options, which do not resolve `@types/*`, so editors report Node globals like `node:path` and `__dirname` as missing. Add new root-level config files to `tsconfig.tools.json` rather than to the app project, which keeps them out of the build output.

## Add new projects

While you could add new projects to your workspace manually, you might want to leverage [Nx plugins](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) and their [code generation](https://nx.dev/features/generate-code?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) feature.

Use the plugin's generator to create new projects.

To generate a new application, use:

```sh
npx nx g @nx/nest:app demo
```

To generate a new library, use:

```sh
npx nx g @nx/node:lib mylib
```

You can use `npx nx list` to get a list of installed plugins. Then, run `npx nx list <plugin-name>` to learn about more specific capabilities of a particular plugin. Alternatively, [install Nx Console](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) to browse plugins and generators in your IDE.

[Learn more about Nx plugins &raquo;](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) | [Browse the plugin registry &raquo;](https://nx.dev/plugin-registry?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `nx affected -t lint test build` on every push. It has to work on a clean checkout — no `.env`, no generated Prisma client — which is why `build` and `test` both depend on `generate-types`, and why `prisma.config.ts` tolerates a missing `.env`.

This workspace is **not** connected to Nx Cloud. Connecting it would add:

- [Remote caching](https://nx.dev/ci/features/remote-cache?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task distribution across multiple machines](https://nx.dev/ci/features/distribute-task-execution?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Automated e2e test splitting](https://nx.dev/ci/features/split-e2e-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task flakiness detection and rerunning](https://nx.dev/ci/features/flaky-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

```sh
npx nx connect
```

[Learn more about Nx on CI](https://nx.dev/ci/intro/ci-with-nx#ready-get-started-with-your-provider?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## AI agent setup

The workspace ships shared configuration for AI coding assistants, generated by `nx configure-ai-agents` and committed so that every contributor's tooling behaves the same way.

| Path                    | Purpose                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`             | The working agreement for this repo, and the single source of truth for it. Cursor reads the same file through a pointer at `.cursor/rules/jobber.mdc`. |
| `AGENTS.md`             | The same Nx guidance in the cross-tool format read by Codex, OpenCode, and Gemini.                                                                      |
| `.agents/skills/`       | Instructions loaded on demand for exploring the workspace, running tasks, scaffolding with generators, and wiring up cross-project imports.             |
| `.claude/settings.json` | Enables the Nx plugin for Claude Code, fetched from the `nrwl/nx-ai-agents-config` marketplace on GitHub.                                               |

The blocks between the `<!-- nx configuration start/end -->` markers in `CLAUDE.md` and `AGENTS.md` are regenerated by Nx — put your own content outside them or it will be overwritten.

`.cursor/` is git-ignored, so the Cursor pointer file is local only. After a fresh clone, recreate `.cursor/rules/jobber.mdc` pointing at `CLAUDE.md`, or Cursor will start with no project rules at all.

Re-run or update the setup with:

```sh
npx nx configure-ai-agents
```

The Nx MCP server exposes four tools: version-correct documentation lookups, graph visualization, and inspection of currently running Nx tasks — including reading their terminal output, which no CLI command offers. Two further tools appear once the workspace is connected to Nx Cloud.

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/nx-api/nest?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Learn about Nx on CI](https://nx.dev/ci/intro/ci-with-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Releasing Packages with Nx release](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:

- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
