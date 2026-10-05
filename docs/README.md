# YounifyAI documentation

Read in this order. Each file stands alone; together they are everything needed to take the project over.

| File | What it answers |
|---|---|
| [00-design-spec.md](00-design-spec.md) | What we decided to build and why, with the page-by-page product |
| [01-architecture.md](01-architecture.md) | How the system fits together: processes, layers, deployment, security |
| [02-data-model.md](02-data-model.md) | Every table and column, the constraints, and how row-level security works |
| [03-data-flow.md](03-data-flow.md) | What happens from "capture" to "approved document", step by step |
| [04-api-reference.md](04-api-reference.md) | Every endpoint, its body, its response, and its errors |
| [05-ai-pipeline.md](05-ai-pipeline.md) | The seven stages, the provider interface, prompts, retrieval, YouTube |
| [06-frontend.md](06-frontend.md) | Routes, the design system, the 3D hero, and how pages get their data |
| [07-handoff.md](07-handoff.md) | Set up from scratch, run, test, deploy, swap models, and known limits |

Quick orientation:

```
YounifyAI
├── frontend/   React + Vite. Marketing site, app, 3D hero.
├── backend/    Express API, Postgres schema, pipeline worker, AI providers.
├── shared/     Templates, validation, exports, offline structuring. Used by both.
└── docs/       These files.
```

One sentence per layer:

- **shared** knows what a document *is* (templates, fields, validation, Markdown).
- **backend** owns the data, the rules and the pipeline that fills documents in.
- **frontend** is how a person captures, reviews and approves them.
