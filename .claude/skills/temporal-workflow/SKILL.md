---
name: temporal-workflow
description: Convenciones para crear o modificar workflows y activities de Temporal en este repo. Úsala siempre que toques backend/src/workflows o un endpoint que arranque workflows.
---
# Workflows de Temporal en este repo

- Workflows en `backend/src/workflows`, activities en `backend/src/workflows/activities`. Los workflows son deterministas: sin `fetch`, `Date.now()`, `Math.random()` ni Prisma; todo efecto va en una activity.
- Cada `proxyActivities` lleva `startToCloseTimeout` explícito y una retry policy acotada (`maximumAttempts: 3`, `initialInterval: '1s'`, `backoffCoefficient: 2`) salvo que se justifique otra.
- Errores que no tiene sentido reintentar (4xx, datos inválidos) se lanzan como `ApplicationFailure.nonRetryable`.
- Las rutas HTTP arrancan workflows con `client.workflow.start` (no `execute`) y responden 202. El `workflowId` es determinista por entidad, p. ej. `enrich-phone-${leadId}`, para que sea idempotente.
- El estado visible para el usuario se guarda en BD mediante una activity, y el frontend hace polling con `refetchInterval` de React Query.
- Cada workflow tiene tests con `@temporalio/testing` (`TestWorkflowEnvironment`, time skipping) y activities mockeadas.
- Credenciales y URLs de proveedores en `.env`, documentadas en `.env.sample`.
