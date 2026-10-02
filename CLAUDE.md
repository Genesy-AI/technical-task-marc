# TinyEnginy

Take-home: gestor de leads (CSV import, verificación de email, generación de mensajes, enriquecimiento de teléfono). Detalle de las tareas en [README.md](README.md).

## Stack
- **Backend** (`backend/`): Node 22, Express 5, Prisma 6 + SQLite (`prisma/dev.db`), Temporal (`@temporalio/*`), Vitest. TypeScript con ts-node/nodemon.
- **Frontend** (`frontend/`): React 18, Vite 7, TypeScript, Tailwind 4, TanStack Query, axios, papaparse, react-hot-toast, Vitest + Testing Library.
- pnpm en ambos paquetes (no hay workspace raíz).

## Estructura
- `backend/src/index.ts`: todas las rutas Express (`/leads`, `/leads/bulk`, `/leads/generate-messages`, `/leads/verify-emails`) y arranque del worker.
- `backend/src/worker.ts`: worker de Temporal (`localhost:7233`, namespace `default`, task queue `myQueue`).
- `backend/src/workflows/`: `workflows.ts`, `activities/`, `index.ts` (re-exporta los workflows).
- `backend/src/utils/`: lógica pura (`messageGenerator.ts` + test al lado).
- `backend/prisma/`: `schema.prisma` (modelo `lead`) y `migrations/`.
- `frontend/src/api/`: `modules/` (endpoints), `types/<recurso>/<accion>.ts` (Input/Output), `mutations/`, `utils.ts` (`endpoint()`).
- `frontend/src/components/`: `LeadsList`, `CsvImportModal`, `MessageTemplateModal`. `utils/csvParser.ts` parsea CSV.
- `docs/`: CSVs de ejemplo y wireframes. `.claude/`: agente `code-reviewer` y skill `temporal-workflow`.

## Comandos
Requiere Temporal en marcha: `temporal server start-dev` (UI en :8233).
```
# Backend (cd backend)
pnpm install && pnpm migrate:dev && pnpm gen:prisma   # setup / migrar
pnpm dev                                              # API en :4000 (+ worker)
pnpm test | pnpm test:watch | pnpm build | pnpm format

# Frontend (cd frontend)
pnpm install
pnpm dev                                              # http://localhost:5173
pnpm test | pnpm lint | pnpm build | pnpm format
```
Tras cambiar `schema.prisma`: `pnpm migrate:dev` (genera migración y cliente).

## Convenciones
- Prettier en ambos: sin `;`, comillas simples, `printWidth` 110, `trailingComma: es5`.
- Tests con Vitest junto al código (`foo.ts` → `foo.test.ts`).
- Frontend: cada endpoint se declara en `api/modules/` con tipos `XInput`/`XOutput` en `api/types/`; las mutaciones pasan por `useApiMutation`. `VITE_API_URL` en `frontend/.env`.
- Workflows de Temporal: seguir [.claude/skills/temporal-workflow/SKILL.md](.claude/skills/temporal-workflow/SKILL.md) (deterministas, timeouts + retry en activities, `workflowId` por entidad, rutas responden 202, estado en BD + polling).
- Revisar diffs con el agente `code-reviewer` antes de commitear.

## Ojos con
- `frontend/src/api/modules/leads.ts` usa `PUT /leads/:id` pero el backend expone `PATCH`.
- `backend/.env.sample` habla de MySQL pero el datasource real es SQLite con `file:./dev.db`; no hace falta `.env` en backend.
