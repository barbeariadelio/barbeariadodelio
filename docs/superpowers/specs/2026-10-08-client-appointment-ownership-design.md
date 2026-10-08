# Correção de vínculo entre clientes e agendamentos

## Objetivo

Garantir que um cliente autenticado veja e consiga operar somente os próprios agendamentos, mesmo quando existirem registros históricos duplicados, `userId` antigo ou telefones armazenados com máscara/código `55`.

## Diagnóstico

O agendamento aponta para `Client`, enquanto a tela do cliente resolve os agendamentos a partir do `userId` associado ao `Client`. Registros criados por atendimento, contas duplicadas e variações de telefone podem deixar o `Client.userId` apontando para outra conta ou sem vínculo. O endpoint atual de leitura só considera o vínculo direto e um fallback limitado a registros sem `userId`.

## Decisões

1. O telefone será comparado por uma função única que remove caracteres não numéricos e trata o formato nacional de dez/onze dígitos e o mesmo número com prefixo `55` como equivalentes.
2. A resolução de posse será centralizada no módulo de clientes. O vínculo direto por `userId` é prioritário; o fallback por telefone exige conta ativa com papel `client` e só aceita um registro cujo vínculo atual esteja ausente, inativo, não seja de cliente ou tenha telefone incompatível.
3. A leitura de `/appointments/my` e as autorizações de leitura, alteração e cancelamento usarão a mesma resolução de posse. Assim, um registro histórico elegível não fica invisível nem pode ser operado por outro cliente.
4. Criações administrativas, autoagendamento autenticado e guest booking usarão a mesma normalização e procura por telefone/unidade para não criar novos duplicados.
5. O login público poderá relinkar somente registros compatíveis com o telefone e com contas client inativas/incompatíveis. Não haverá migração em massa, alteração manual do banco ou reparo global automático nesta entrega.
6. O merge de dois registros vinculados a contas client ativas diferentes será recusado com conflito para evitar transferência silenciosa de histórico entre pessoas. Merges sem conflito continuam carregando o vínculo existente.

## Segurança e limites

- Nunca usar apenas telefone para autorizar funcionário, caixa ou dono.
- Nunca vincular um `Client` a uma conta interna (`owner`, `employee` ou `cashier`).
- Nunca usar regex frouxa para telefone.
- Não alterar `unitId` durante resolução de posse; a mesma pessoa pode ter um registro por unidade.
- Não criar índices únicos nem alterar dados antigos em lote sem uma etapa de auditoria/migração separada.

## Critérios de aceite

- Marina Torres, com conta ativa e telefone compatível, recebe os agendamentos do `Client` histórico que estava vinculado a uma conta client antiga com telefone diferente.
- Uma conta client não recebe agendamentos de outro telefone nem de um registro ligado a outra conta client ativa com telefone compatível ambíguo.
- Telefones `19983350939` e `5519983350939` são tratados como o mesmo telefone; telefones de outras pessoas não coincidem.
- Criar cliente, autoagendar ou agendar como convidado reutiliza o registro da mesma unidade quando o telefone é equivalente.
- Cliente pode cancelar/editar somente agendamento pertencente aos IDs resolvidos para sua conta.
- Merge conflitante é rejeitado antes de mover agendamentos ou apagar registros.
- Testes unitários e build completo passam; nenhum script de reparo de produção é executado.