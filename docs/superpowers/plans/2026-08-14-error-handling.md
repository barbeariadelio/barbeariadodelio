# Tratamento centralizado de erros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Padronizar falhas da API e oferecer mensagens de recuperação consistentes nos três aplicativos, sem expor detalhes internos.

**Architecture:** A API converterá exceções operacionais em respostas seguras com código estável e identificador de requisição. Um normalizador puro em @barber/utils converte falhas HTTP, de rede e timeout; React Query e @barber/ui apresentam avisos e recuperação sem alterar regras de negócio.

**Tech Stack:** Express 4, TypeScript, Pino, cls-rtracer, Multer, Zod, React 18, TanStack Query 5, Axios 1, Vitest 1 e Vite 5.

**Spec:** docs/superpowers/specs/2026-08-14-error-handling-design.md

## Global Constraints

- Preservar o campo message e todas as respostas de sucesso atuais.
- Nunca devolver pilha, texto do banco, token ou configuração ao navegador.
- Não adicionar Sentry, outro serviço externo ou telemetria persistida no navegador.
- Não repetir notificação global quando a mutation já declarar onError local.
- Nova tentativa só pode ser oferecida para query; nunca para mutation.
- Não alterar regras de negócio, permissões, cálculos financeiros ou o fluxo público de nome e telefone.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| server/src/shared/errors/AppError.ts | Códigos e detalhes seguros de falhas operacionais. |
| server/src/shared/middlewares/errorHandler.ts | Mapeamento de exceções ao formato da API. |
| server/src/app.ts | Correlação, limite JSON e fallback de rota de API. |
| server/src/modules/{appointments,finance,upload} | Encaminhamento dos cinco erros HTTP diretos ao handler global. |
| server/src/__tests__/error-handler.spec.ts | Testes de formato e mapeamentos do servidor. |
| packages/utils/src/apiError.ts | Normalizador independente de Axios e evento de aviso. |
| server/src/__tests__/api-error.spec.ts | Testes do normalizador usando o Vitest já disponível no servidor. |
| packages/ui/src/components/AppErrorFeedback/AppErrorFeedback.tsx | Boundary e aviso acessível compartilhados. |
| apps/*/src/api/client.ts | Rejeição do erro normalizado após manter o refresh de token. |
| apps/*/src/main.tsx | Cache global do React Query e montagem do feedback. |

### Task 1: Contrato seguro da API

**Files:**
- Modify: server/src/shared/errors/AppError.ts
- Modify: server/src/shared/middlewares/errorHandler.ts
- Create: server/src/__tests__/error-handler.spec.ts

**Interfaces:**
- Produces: AppError(message, statusCode, code, details?).
- Produces: { message, code, requestId, details? } em toda resposta 4xx e 5xx.

- [ ] **Step 1: Escrever testes de erro que falham hoje**

~~~ts
expect(response.status).toBe(422);
expect(response.body).toEqual({
  message: 'Existem campos inválidos.',
  code: 'VALIDATION_ERROR',
  requestId: expect.any(String),
  details: { guestPhone: 'Telefone inválido' },
});
~~~

Cobrir AppError, Mongo 11000, ValidationError e CastError do Mongoose, ZodError, MulterError, JWT inválido e exceção desconhecida sem stack no corpo.

- [ ] **Step 2: Rodar o teste vermelho**

Run: npm.cmd --workspace @barber/server run test -- error-handler.spec.ts

Expected: FAIL porque a resposta atual contém apenas message.

- [ ] **Step 3: Implementar o contrato**

~~~ts
export type ApiErrorCode =
  | 'VALIDATION_ERROR' | 'DUPLICATE_RESOURCE' | 'INVALID_IDENTIFIER'
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'RATE_LIMITED'
  | 'UPLOAD_INVALID_FILE' | 'UPLOAD_TOO_LARGE' | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code: ApiErrorCode = 'VALIDATION_ERROR',
    public readonly details?: Record<string, string>,
  ) { super(message); this.name = 'AppError'; }
}
~~~

Em errorHandler, extrair requestId de req.id ou rtracer.id(), definir X-Request-Id e serializar somente o contrato. Logar err e stack apenas para INTERNAL_ERROR.

- [ ] **Step 4: Rodar o teste verde**

Run: npm.cmd --workspace @barber/server run test -- error-handler.spec.ts

Expected: PASS, com código e identificador em todos os casos.

- [ ] **Step 5: Commitar**

~~~bash
git add server/src/shared/errors/AppError.ts server/src/shared/middlewares/errorHandler.ts server/src/__tests__/error-handler.spec.ts
git commit -m "feat: padroniza respostas de erro da api"
~~~

### Task 2: Limites, rota ausente e retornos diretos

**Files:**
- Modify: server/src/app.ts
- Modify: server/src/__tests__/app.rate-limit.spec.ts
- Modify: server/src/modules/appointments/appointment.controller.ts
- Modify: server/src/modules/finance/finance.controller.ts
- Modify: server/src/modules/upload/upload.controller.ts
- Modify: server/src/modules/upload/upload.routes.ts
- Modify: server/src/__tests__/error-handler.spec.ts

**Interfaces:**
- Consumes: AppError e errorHandler da Task 1.
- Produces: rate limit e endpoint de API inexistente no mesmo contrato JSON.

- [ ] **Step 1: Escrever os testes de integração vermelhos**

~~~ts
expect(response.status).toBe(429);
expect(response.body.code).toBe('RATE_LIMITED');
expect(response.body.requestId).toEqual(expect.any(String));

const missing = await request(app).get('/appointments/does-not-exist');
expect(missing.body.code).toBe('NOT_FOUND');
~~~

- [ ] **Step 2: Rodar os testes**

Run: npm.cmd --workspace @barber/server run test -- app.rate-limit.spec.ts error-handler.spec.ts

Expected: FAIL pois o limitador entrega texto e a rota ausente não usa o handler.

- [ ] **Step 3: Instalar os fallbacks na ordem segura**

Mover rtracer.expressMiddleware() e pinoHttp() para antes dos limitadores. Substituir message dos três rate limiters por handler que encaminha new AppError('Muitas tentativas. Tente novamente mais tarde.', 429, 'RATE_LIMITED').

Após as rotas, acrescentar middleware que encaminhe somente os prefixos /auth, /units, /clients, /services, /employees, /appointments, /finance, /franchise, /products, /users, /notifications, /events e /upload para new NotFoundError('Rota'); deixar os demais caminhos seguirem à SPA.

Trocar cada res.status(...).json({ message }) em appointments, finance e upload por next(new AppError(...)). Mapear falta de arquivo para VALIDATION_ERROR, tipo inválido para UPLOAD_INVALID_FILE e tamanho para UPLOAD_TOO_LARGE.

- [ ] **Step 4: Rodar integração verde**

Run: npm.cmd --workspace @barber/server run test -- app.rate-limit.spec.ts error-handler.spec.ts

Expected: PASS; 429 e 404 têm corpo seguro, sem interceptar rota da SPA.

- [ ] **Step 5: Commitar**

~~~bash
git add server/src/app.ts server/src/__tests__/app.rate-limit.spec.ts server/src/modules/appointments/appointment.controller.ts server/src/modules/finance/finance.controller.ts server/src/modules/upload/upload.controller.ts server/src/modules/upload/upload.routes.ts server/src/__tests__/error-handler.spec.ts
git commit -m "feat: cobre falhas de rota, upload e limite"
~~~

### Task 3: Normalizador compartilhado do navegador

**Files:**
- Create: packages/utils/src/apiError.ts
- Modify: packages/utils/src/index.ts
- Create: server/src/__tests__/api-error.spec.ts

**Interfaces:**
- Produces: normalizeApiError(error: unknown): ApiError.
- Produces: reportApiError(error: unknown, retry?: () => Promise<unknown>): void.
- Produces: API_ERROR_EVENT para a camada visual.

- [ ] **Step 1: Escrever o teste vermelho**

~~~ts
expect(normalizeApiError({
  response: { status: 429, data: { message: 'Aguarde.', code: 'RATE_LIMITED', requestId: 'req-1' } },
})).toMatchObject({ status: 429, code: 'RATE_LIMITED', requestId: 'req-1' });

expect(normalizeApiError({ code: 'ECONNABORTED' })).toMatchObject({
  code: 'TIMEOUT',
  message: 'A solicitação demorou demais. Tente novamente.',
});
~~~

Cobrir resposta sem code, rede sem response, timeout, 500 sem mensagem e ApiError já normalizado.

- [ ] **Step 2: Rodar o teste**

Run: npm.cmd --workspace @barber/server run test -- api-error.spec.ts

Expected: FAIL porque normalizeApiError não existe.

- [ ] **Step 3: Implementar sem importar Axios**

~~~ts
export class ApiError extends Error {
  readonly isApiError = true;
  constructor(
    message: string,
    public readonly code: ApiErrorCode,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly details?: Record<string, string>,
    public readonly response?: unknown,
    public readonly config?: unknown,
  ) { super(message); this.name = 'ApiError'; }
}
~~~

Ler propriedades estruturais de unknown e preservar response e config para os catches existentes. Fora do navegador, reportApiError não deve tentar criar CustomEvent.

- [ ] **Step 4: Rodar o teste verde**

Run: npm.cmd --workspace @barber/server run test -- api-error.spec.ts

Expected: PASS para todos os formatos de falha.

- [ ] **Step 5: Commitar**

~~~bash
git add packages/utils/src/apiError.ts packages/utils/src/index.ts server/src/__tests__/api-error.spec.ts
git commit -m "feat: normaliza erros consumidos pelas interfaces"
~~~

### Task 4: Boundary e aviso reutilizáveis

**Files:**
- Create: packages/ui/src/components/AppErrorFeedback/AppErrorFeedback.tsx
- Modify: packages/ui/src/index.ts
- Modify: packages/ui/package.json

**Interfaces:**
- Consumes: API_ERROR_EVENT e ApiError da Task 3.
- Produces: <ApiErrorNotifications /> e <AppErrorBoundary applicationName?: string />.

- [ ] **Step 1: Definir comportamento acessível**

~~~tsx
export interface AppErrorBoundaryProps {
  applicationName?: string;
  children: ReactNode;
}

export function ApiErrorNotifications(): JSX.Element | null;
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, { hasError: boolean }> {}
~~~

O aviso usa role="alert", botão de fechar, requestId quando houver e Tentar novamente apenas quando a query fornecer callback.

- [ ] **Step 2: Implementar o componente**

Escutar o evento no useEffect, ignorar mensagens iguais em intervalo inferior a dois segundos e fechar após seis segundos. O callback de retry desabilita o botão enquanto espera a promessa. O boundary exibe somente mensagem segura e um botão para recarregar.

- [ ] **Step 3: Compilar o pacote consumidor**

Run: npm.cmd --workspace @barber/admin run build

Expected: PASS; as exportações atuais de @barber/ui continuam intactas.

- [ ] **Step 4: Commitar**

~~~bash
git add packages/ui/src/components/AppErrorFeedback/AppErrorFeedback.tsx packages/ui/src/index.ts packages/ui/package.json
git commit -m "feat: adiciona feedback visual compartilhado para erros"
~~~

### Task 5: Painéis administrativo e de franquia

**Files:**
- Modify: apps/admin/src/api/client.ts
- Modify: apps/admin/src/main.tsx
- Delete: apps/admin/src/components/ErrorBoundary.tsx
- Modify: apps/franchise/src/api/client.ts
- Modify: apps/franchise/src/main.tsx
- Delete: apps/franchise/src/components/ErrorBoundary.tsx

**Interfaces:**
- Consumes: normalizeApiError, reportApiError, ApiErrorNotifications e AppErrorBoundary.
- Produces: requisições normalizadas e feedback global sem duplicar onError local.

- [ ] **Step 1: Normalizar só a rejeição final do Axios**

Depois da tentativa atual de refresh e de seu redirecionamento de login, trocar o retorno final de cada interceptor por:

~~~ts
return Promise.reject(normalizeApiError(error));
~~~

Não normalizar antes do refresh e não mudar o fluxo 401 existente.

- [ ] **Step 2: Ligar os caches ao aviso**

~~~ts
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => reportApiError(error, () => query.fetch()),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.options.onError) reportApiError(error);
    },
  }),
  defaultOptions: { queries: { retry: 1, staleTime: 0 } },
});
~~~

Montar ApiErrorNotifications dentro de AppErrorBoundary vindo de @barber/ui e remover os boundaries locais duplicados.

- [ ] **Step 3: Compilar ambos os painéis**

Run: npm.cmd --workspace @barber/admin run build; npm.cmd --workspace @barber/franchise run build

Expected: PASS; os dois apps usam o feedback compartilhado e os clientes continuam renovando token.

- [ ] **Step 4: Commitar**

~~~bash
git add apps/admin/src/api/client.ts apps/admin/src/main.tsx apps/admin/src/components/ErrorBoundary.tsx apps/franchise/src/api/client.ts apps/franchise/src/main.tsx apps/franchise/src/components/ErrorBoundary.tsx
git commit -m "feat: exibe erros consistentes nos paineis internos"
~~~

### Task 6: Agendamento público e verificação final

**Files:**
- Modify: apps/booking/package.json
- Modify: apps/booking/src/api/client.ts
- Modify: apps/booking/src/main.tsx
- Modify: docs/superpowers/plans/2026-08-14-error-handling.md

**Interfaces:**
- Consumes: as exportações das Tasks 3 e 4.
- Produces: agendamento público protegido contra falha de renderização e de carregamento, sem exigir cadastro.

- [ ] **Step 1: Declarar e integrar o feedback**

Adicionar "@barber/ui": "*" ao booking. No interceptor, preservar refresh de cliente autenticado e normalizar a rejeição final. Configurar QueryCache e MutationCache como na Task 5, mantendo staleTime: 30_000.

- [ ] **Step 2: Montar boundary e notificação**

~~~tsx
<AppErrorBoundary applicationName="agendamento">
  <BrowserRouter basename="/booking">
    <ApiErrorNotifications />
    <QueryClientProvider client={queryClient}>...</QueryClientProvider>
  </BrowserRouter>
</AppErrorBoundary>
~~~

O erro de carregamento de unidades passa a disparar aviso com retry pelo cache; o fluxo público de nome e telefone não é modificado.

- [ ] **Step 3: Fazer a verificação final**

Run: npm.cmd --workspace @barber/server run test

Run: npm.cmd run build

Run: git diff --check

Expected: testes do servidor passam, quatro workspaces compilam e não há erro de espaço em branco. Marcar os checkboxes somente após a verificação correspondente.

- [ ] **Step 4: Commitar a integração pública e o plano concluído**

~~~bash
git add apps/booking/package.json apps/booking/src/api/client.ts apps/booking/src/main.tsx docs/superpowers/plans/2026-08-14-error-handling.md
git commit -m "feat: trata erros no agendamento publico"
~~~
