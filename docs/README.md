# Jobber — Documentation

Reference docs for the `jobber` Nx monorepo. Start here.

| Doc                                                        | What it covers                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)                       | How the Nx workspace is structured and why — projects, targets, executors, plugins, the project graph, caching, and the everyday Nx commands.                             |
| [graphql-architecture.md](./graphql-architecture.md)       | How the code-first GraphQL API is assembled — resolver/service/Prisma layering, schema generation from decorators, the shared `@jobber/nestjs` lib, and the request flow. |
| [deployment.md](./deployment.md)                           | Packaging `jobber-auth` into a small production Docker image using the `prune` pipeline, plus `docker-compose` for local Postgres and CI image builds.                    |
| [prisma-6-to-7-migration.md](./prisma-6-to-7-migration.md) | Why the Prisma-6 course code broke on Prisma 7.9, each breaking change and its fix, the TypeScript/module-resolution details, and where the generated client should live. |

## Conventions

- Diagrams use [Mermaid](https://mermaid.js.org/) fenced code blocks, which render on GitHub and most Markdown viewers.
- Commands assume the **workspace root** as the working directory unless stated otherwise.
- Everything Prisma/Nx here requires **Node ≥ 22.12**, the floor enforced by `engines` in `package.json`. Local development runs on **Node 24**, which is what `.nvmrc` pins — so the two files serve different purposes rather than disagreeing.
