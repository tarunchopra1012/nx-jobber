# Jobber

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

An [Nx](https://nx.dev) monorepo of NestJS microservices. The first service is `jobber-auth`, which owns user accounts and is backed by its own PostgreSQL database via [Prisma](https://www.prisma.io/) 7.

For a deep dive into how the workspace is structured and why, see [docs/architecture.md](docs/architecture.md). The full documentation index lives in [docs/README.md](docs/README.md).

## Prerequisites

- **Node.js** `^20.19 || ^22.12 || >=24` — required by the Prisma 7 CLI. Older 20.x releases fail with `ERR_REQUIRE_ESM` when running any `prisma` command.
- **Docker** — used to run PostgreSQL locally.

## Getting started

```sh
# 1. Install dependencies
npm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Create a .env file at the repo root (see "Environment variables" below)

# 4. Apply migrations and generate the Prisma client
npx nx run jobber-auth:migrate-prisma --name=init

# 5. Run the service
npx nx serve jobber-auth
```

## Environment variables

Environment variables live in a `.env` file at the **repository root**. It is git-ignored, so each developer creates their own:

```sh
DATABASE_URL=postgres://postgres:jobber@localhost:5432/jobber-auth?schema=public
```

| Variable       | Used by       | Description                                         |
| -------------- | ------------- | --------------------------------------------------- |
| `DATABASE_URL` | `jobber-auth` | PostgreSQL connection string for the auth database. |

The credentials must match `docker-compose.yml`, which starts a `postgres:latest` container on port `5432` with user `postgres`, password `jobber`, and database `jobber-auth`. The compose service declares no named volume, so `docker compose down` discards the data and you will need to re-run the migrations.

## Database and Prisma

Each service owns its own database, and the auth service keeps its Prisma assets inside the app:

| Path                                                | Purpose                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/jobber-auth/prisma/schema.prisma`             | Data model (currently a single `User` model) and generator options.   |
| `apps/jobber-auth/prisma/migrations/`               | Committed SQL migration history.                                      |
| `apps/jobber-auth/prisma.config.ts`                 | Prisma CLI configuration: schema path and the Migrate datasource URL. |
| `apps/jobber-auth/src/app/prisma/prisma.service.ts` | Nest provider extending `PrismaClient` and connecting on module init. |
| `apps/jobber-auth/src/app/prisma/generated/`        | Generated client. Git-ignored, rebuilt by `generate-types`.           |

This workspace runs **Prisma 7**, which behaves quite differently from Prisma 6. If you are following a tutorial or older example and something does not line up, [docs/prisma-6-to-7-migration.md](docs/prisma-6-to-7-migration.md) walks through every breaking change, the error each one produces, and the fix applied here. The short version:

- **`.env` is not auto-loaded.** It is read explicitly in two places, because the CLI and the app are separate processes: `prisma.config.ts` calls `process.loadEnvFile()` on the root `.env` for `generate`/`migrate`, and `main.ts` does the same for the running service.
- **The connection URL no longer lives in `schema.prisma`.** The datasource block only names the provider; the URL is supplied by `prisma.config.ts` via Prisma's `env()` helper for Migrate, and by the driver adapter at runtime.
- **A driver adapter is mandatory at runtime.** `PrismaService` passes `new PrismaPg({ connectionString: process.env.DATABASE_URL })` to `super()`; constructing a bare `new PrismaClient()` throws.
- **The generated client is source code, not a package.** The `prisma-client` generator emits raw TypeScript that has to be compiled with the app, so `output` points into `src/` rather than `node_modules`. It is configured with `moduleFormat = "cjs"` and `importFileExtension = ""` so the output fits the CommonJS NestJS build.
- **Node ≥ 22.12 is required**, because `prisma migrate dev` `require()`s an ESM-only dependency. See [Prerequisites](#prerequisites).

Regenerate the client with `npx nx run jobber-auth:generate-types`, and create a migration with `npx nx run jobber-auth:migrate-prisma --name=<migration_name>`. See [Run tasks](#run-tasks) for the full list of targets.

## Run tasks

To run the dev server for your app, use:

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

To see all available targets to run for a project, run:

```sh
npx nx show project jobber-auth
```

These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

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

## Set up CI!

### Step 1

To connect to Nx Cloud, run the following command:

```sh
npx nx connect
```

Connecting to Nx Cloud ensures a [fast and scalable CI](https://nx.dev/ci/intro/why-nx-cloud?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) pipeline. It includes features such as:

- [Remote caching](https://nx.dev/ci/features/remote-cache?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task distribution across multiple machines](https://nx.dev/ci/features/distribute-task-execution?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Automated e2e test splitting](https://nx.dev/ci/features/split-e2e-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task flakiness detection and rerunning](https://nx.dev/ci/features/flaky-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

### Step 2

Use the following command to configure a CI workflow for your workspace:

```sh
npx nx g ci-workflow
```

[Learn more about Nx on CI](https://nx.dev/ci/intro/ci-with-nx#ready-get-started-with-your-provider?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

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
