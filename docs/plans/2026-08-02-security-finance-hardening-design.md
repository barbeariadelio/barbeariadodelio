# Segurança, agenda e financeiro — desenho aprovado

## Contexto

O produto atende uma única barbearia com duas unidades e um agendamento público centralizado. Não é um SaaS multiempresa. A unidade continua sendo um limite operacional e de autorização, mas clientes podem agendar nas duas unidades publicadas.

## Regras de acesso aprovadas

| Papel | Pode fazer |
| --- | --- |
| Cliente | Criar, reagendar e cancelar somente o próprio agendamento público. |
| Funcionário | Gerenciar somente a própria agenda e bloquear somente horários próprios. |
| Caixa | Gerenciar agenda, pagamentos e financeiro operacional das unidades autorizadas. |
| Dono | Acesso administrativo completo. |

Clientes nunca podem criar bloqueios, escolher `clientId`, mudar unidade/profissional/produtos/pacotes/preços, nem alterar status interno. Um login público nunca pode emitir token de funcionário, caixa ou dono.

## Agenda pública e interna

1. Criar contratos de entrada específicos para cliente, funcionário e operação interna. O contrato do cliente aceita somente os dados necessários para o agendamento e o servidor determina cliente, unidade permitida, preço, serviços e status.
2. Validar no servidor a disponibilidade efetiva antes de gravar: unidade aberta, profissional ativo e da unidade, jornada do profissional, serviço habilitado para ele, duração, pacote elegível e ausência de conflito.
3. Serializar alterações da agenda por profissional e dia, incluindo reagendamento e bloqueio, para impedir sobreposição concorrente. A checagem de conflito continua sendo a fonte de verdade dentro da seção serializada.
4. Validar datas, horários, intervalos e durações de forma semântica; configurações inválidas não podem gerar loops ou horários impossíveis.

## Financeiro e permissões

1. Somente dono e caixa podem criar, editar ou excluir lançamentos manuais, registrar pagamento de funcionário e visualizar o financeiro operacional. Funcionários não recebem essas rotas.
2. Lançamentos derivados de atendimento, venda, pacote ou assinatura não podem ser alterados/excluídos pela rota genérica; a operação de origem deve ser usada.
3. Pagamento de comissões, alteração de estado das comissões e lançamento de salário devem ocorrer de forma atômica. A despesa de comissão não pode ser contada novamente quando o salário é lançado.
4. Vendas devem gravar financeiro e baixar estoque como uma única operação, recusando estoque insuficiente.

## Regra aprovada para vales

Registrar um vale cria uma dívida pendente do funcionário. O próximo pagamento de comissão deve consumir automaticamente todos os saldos de vales elegíveis do funcionário, dos mais antigos aos mais recentes, mesmo que tenham sido registrados em período anterior. Um vale futuro não é elegível.

- O pagamento consome no máximo o total das comissões selecionadas.
- Se o vale for maior, o saldo permanece para o próximo pagamento.
- Cada consumo registra valor, vale de origem, pagamento e data para auditoria.
- O botão manual de marcar vale como descontado deixa de ser a origem do cálculo.
- Dados históricos marcados apenas com `isPaid` exigem reconciliação segura antes de qualquer reabertura, para evitar desconto em duplicidade.

Exemplo aprovado: comissões de R$ 180 e vales pendentes de R$ 100 e R$ 40 resultam em pagamento de R$ 40, com os dois vales baixados integralmente. Se as comissões fossem R$ 90, o pagamento seria R$ 0, o vale de R$ 100 teria saldo de R$ 10 e o vale de R$ 40 continuaria pendente.

## Limites de escopo

As alterações locais já existentes, especialmente o módulo não rastreado de assinaturas, não serão sobrescritas. Integrações com essas alterações serão verificadas sem reescrever a implementação em andamento. Alterações de regra comercial de pacotes e assinaturas que não estejam documentadas serão tratadas separadamente após confirmação do fluxo de cobrança.
