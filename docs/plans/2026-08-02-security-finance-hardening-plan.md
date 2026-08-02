# Plano de execução: segurança, agenda e financeiro

> **Objetivo:** corrigir as falhas de prioridade alta e média identificadas, sem alterar as mudanças locais já existentes. A regra de acesso e o novo fluxo de vales estão definidos em `2026-08-02-security-finance-hardening-design.md`.

## Premissas e limites

- A barbearia possui duas unidades e um único agendamento público centralizado.
- O checkout contém mudanças locais não relacionadas, incluindo `server/src/modules/subscriptions/`. Elas não serão sobrescritas.
- Cada etapa deve começar por um teste que falha e terminar com teste de regressão, build do pacote afetado e revisão do diff.
- Para operações financeiras atômicas, confirmar que o MongoDB em produção suporta transações. Se não suportar, usar atualizações condicionais e uma trava de operação por funcionário como alternativa documentada.

## Etapa 1 — Base de testes e contratos de entrada

**Arquivos:**

- Criar: `server/src/modules/appointments/__tests__/appointment.controller.spec.ts`
- Criar: `server/src/modules/finance/__tests__/finance.service.spec.ts`
- Criar: `server/src/modules/auth/__tests__/auth.service.spec.ts`
- Modificar: `server/src/modules/appointments/appointment.schema.ts`
- Modificar: `server/src/modules/finance/finance.schema.ts`

**Passos:**

1. Criar fixtures e mocks seguindo o padrão existente de Vitest em `appointment.service.spec.ts`.
2. Escrever testes de contrato que rejeitem campos extras e ações não permitidas antes de mudar os controllers.
3. Separar schemas de criação/edição pública, atualização própria do cliente e operação interna.
4. Criar validadores semânticos para data (`YYYY-MM-DD` real), horário (`HH:mm` real), duração e intervalo de agenda positivos.

**Testes iniciais obrigatórios:**

- Cliente não cria `blocked`, não informa `clientId`, preço, unidade, produto, pacote ou status.
- Cliente não altera os mesmos campos por `PATCH`.
- Datas como `2026-99-99`, horários como `25:99` e intervalo menor ou igual a zero falham com `400`.

## Etapa 2 — Autenticação e autorização

**Arquivos:**

- Modificar: `server/src/modules/auth/auth.service.ts`
- Modificar: `server/src/modules/auth/auth.routes.ts`
- Modificar: `server/src/modules/appointments/appointment.routes.ts`
- Modificar: `server/src/modules/appointments/appointment.controller.ts`
- Modificar: `server/src/modules/finance/finance.routes.ts`
- Modificar: `server/src/modules/finance/finance.controller.ts`
- Modificar: `server/src/modules/finance/finance.service.ts`

**Passos:**

1. No login público, emitir token exclusivamente para usuário com papel `client`; nunca procurar e reutilizar usuário de outro papel pelo mesmo telefone.
2. Dividir as rotas de agendamento por capacidade: cliente, funcionário, caixa/dono e ação de bloqueio própria do funcionário.
3. Resolver o cliente autenticado e a unidade autorizada no servidor; ignorar identificadores e valores internos enviados pelo navegador.
4. Autorizar bloqueios apenas para dono, caixa ou funcionário no próprio `employeeId`; cliente recebe `403`.
5. Restringir lançamento, edição, exclusão e consulta financeira operacional a dono/caixa. Permitir ao funcionário somente a consulta da própria remuneração, caso essa tela continue publicada.
6. Recusar alteração e exclusão genérica de transações vinculadas a atendimento, venda, pacote ou assinatura.

**Testes de regressão:**

- Login público com telefone de funcionário/caixa/dono não emite token privilegiado.
- Cliente não lê ou altera agenda de outro cliente e não muda campos internos.
- Funcionário não bloqueia horário de outro funcionário e não acessa endpoints de financeiro operacional.
- Transação gerada pelo sistema não aceita `PATCH` nem `DELETE` genéricos.

## Etapa 3 — Disponibilidade e integridade da agenda

**Arquivos:**

- Modificar: `server/src/modules/appointments/appointment.service.ts`
- Modificar: `server/src/modules/appointments/appointment.controller.ts`
- Modificar: `server/src/modules/appointments/appointment.model.ts` somente se for necessário para uma trava persistente
- Modificar: `server/src/modules/units/unit.model.ts`
- Modificar: `server/src/modules/employees/employee.service.ts`
- Modificar: `server/src/shared/cache/slotCache.ts`, se a invalidação for afetada

**Passos:**

1. Extrair uma única validação de disponibilidade que seja reutilizada pelo cálculo de slots, agendamento público, interno, bloqueio e reagendamento.
2. Validar unidade ativa/aberta, jornada do profissional, compatibilidade do serviço, duração calculada pelo servidor e conflito de intervalo completo.
3. Substituir a trava por horário inicial por uma serialização segura por `unidade + profissional + data`, garantindo que agendamentos com inícios diferentes não ocupem o mesmo intervalo em paralelo.
4. Invalidar slots afetados pelo estado anterior e posterior em reagendamentos/cancelamentos.

**Testes de regressão:**

- POST público fora da jornada, para serviço não habilitado ou unidade fechada falha.
- Dois pedidos simultâneos sobrepostos resultam em no máximo um agendamento.
- Reagendamento invalida disponibilidade antiga e nova.
- Intervalo inválido não causa geração infinita de slots.

## Etapa 4 — Vales, comissões e pagamentos

**Arquivos:**

- Modificar: `server/src/modules/finance/transaction.model.ts`
- Modificar: `server/src/modules/finance/finance.service.ts`
- Modificar: `server/src/modules/finance/finance.controller.ts`
- Modificar: `server/src/modules/finance/finance.schema.ts`
- Modificar: `apps/admin/src/pages/Employees/EmployeeVales.tsx`
- Modificar: `apps/admin/src/pages/Commissions/Commissions.tsx`
- Espelhar as alterações em: `apps/franchise/src/pages/Employees/EmployeeVales.tsx` e `apps/franchise/src/pages/Commissions/Commissions.tsx`
- Criar: `server/src/modules/finance/__tests__/finance.service.spec.ts`
- Criar, se necessário: `server/src/scripts/audit-legacy-vouchers.ts` (somente leitura)

**Passos:**

1. Modelar saldo do vale e alocações auditáveis no pagamento: vale de origem, valor abatido, pagamento que o consumiu, data e operador. `isPaid` deixa de representar desconto manual novo.
2. No registro do pagamento, localizar vales pendentes do mesmo funcionário/unidade com data menor ou igual à data de pagamento, ordenar por data/criação e consumir os mais antigos até o limite das comissões selecionadas.
3. Persistir, na mesma transação, alocações de vale, saldos atualizados, comissões quitadas e lançamento de salário líquido. O pedido do navegador não define o valor financeiro final.
4. Remover o botão de marcar vale como descontado ou convertê-lo em visualização de saldo; a baixa ocorre apenas junto ao pagamento.
5. Mostrar separadamente: total original, saldo pendente, valores já consumidos e vínculo com o pagamento.
6. Corrigir o resumo para não contar comissão e salário como duas despesas do mesmo pagamento.
7. Executar uma auditoria somente leitura dos registros históricos com `voucher` e `isPaid: true`; só migrar/reabrir saldos após relatório revisado, para evitar desconto duplicado.

**Casos de teste obrigatórios:**

- Vale de R$ 100 em um dia e R$ 40 no dia seguinte; pagamento de R$ 180 em comissões gera salário de R$ 40 e consome os dois vales.
- Os mesmos vales com R$ 90 de comissões geram salário de R$ 0, saldo de R$ 10 no primeiro vale e R$ 40 no segundo.
- Vale de período anterior é abatido; vale com data futura não é.
- Pagamento parcial não perde o saldo restante e dois pagamentos concorrentes não consomem o mesmo vale.
- Requisição com valor digitado diferente do calculado não altera o valor líquido.
- O resumo financeiro considera a obrigação de comissão uma única vez.

## Etapa 5 — PDV, estoque e faturamento de atendimento

**Arquivos:**

- Modificar: `server/src/modules/inventory/product.service.ts`
- Modificar: `server/src/modules/inventory/product.controller.ts`
- Modificar: `server/src/modules/finance/finance.service.ts`
- Modificar: `server/src/modules/appointments/appointment.service.ts`
- Modificar os clientes de venda em `apps/admin/src/pages/Clients/Clients.tsx` e `apps/franchise/src/pages/Clients/Clients.tsx`

**Passos:**

1. Criar operação única de venda para registrar receita e reduzir estoque de forma atômica.
2. Validar quantidade positiva, desconto limitado ao preço, produto da unidade e estoque suficiente antes de confirmar.
3. Corrigir a reversão de atendimento concluído para restaurar somente produtos efetivamente faturados e manter consistência entre estoque e lançamentos.

**Testes de regressão:**

- Estoque insuficiente rejeita a venda e não cria receita.
- Erro ao baixar estoque não deixa lançamento financeiro órfão.
- Reverter atendimento não restaura produto que não foi faturado.

## Etapa 6 — Itens operacionais de prioridade média

**Arquivos:**

- Modificar: `server/src/app.ts`
- Modificar: `server/src/modules/appointments/appointment.routes.ts`
- Modificar páginas públicas de serviços em `apps/booking/src/`
- Modificar: `railway.toml` somente após confirmar mecanismo de agendamento em produção

**Passos:**

1. Aplicar rate limit efetivo às rotas de login público e agendamento de visitante, sem depender de um prefixo inexistente.
2. Exibir no agendamento público apenas serviços ativos e habilitados para venda online.
3. Montar rotas operacionais de tarefas se a funcionalidade estiver publicada; caso contrário, remover a superfície morta do deploy.
4. Definir com a infraestrutura a execução recorrente e idempotente de royalties. Não alterar `railway.toml` até a forma de agendamento ser confirmada.

## Etapa 7 — Verificação e entrega

1. Executar testes unitários do servidor e os novos cenários de regressão.
2. Executar `npm --workspace @barber/server run build` e builds dos aplicativos alterados.
3. Rodar lint/formatação somente nos arquivos modificados, sem formatar mudanças locais não relacionadas.
4. Revisar o diff para garantir que os módulos locais de assinaturas e telas de serviço não foram alterados indevidamente.
5. Entregar relatório com testes executados, resultados, limitações de migração histórica de vales e ações operacionais pendentes.
