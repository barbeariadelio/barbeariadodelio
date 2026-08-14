# Tratamento centralizado de erros

## Objetivo

Fazer com que qualquer falha previsível do sistema seja comunicada de forma
clara ao usuário, sem expor detalhes internos, e que falhas inesperadas sejam
registradas no servidor com um identificador que permita localizá-las. O
escopo inclui a API, os painéis administrativo e de franquia e o agendamento
público. Não inclui Sentry ou outro serviço externo de monitoramento.

## Decisão

Será adotado um contrato único de erro na API, mantido compatível com o campo
`message` que os aplicativos já consomem:

```json
{
  "message": "Mensagem apropriada para a pessoa usuária.",
  "code": "ERROR_CODE",
  "requestId": "identificador-da-requisicao",
  "details": { "campo": "Mensagem do campo" }
}
```

`details` só será enviado para erros de validação e conterá apenas mensagens
seguras por campo. Os campos opcionais serão omitidos quando não se aplicarem.
As respostas de sucesso não mudam.

## Servidor

`AppError` passará a representar falhas operacionais com código estável,
status HTTP e detalhes opcionais. O manipulador global converterá erros de:

- autorização e autenticação, incluindo token inválido ou expirado;
- validação de schema e do Mongoose;
- chave duplicada, identificador inválido e arquivo inválido ou grande demais;
- limite de requisições;
- rota de API não encontrada;
- falhas inesperadas.

O servidor devolverá mensagens em português adequadas para cada caso e nunca
devolverá pilha, erro do banco, token ou configuração. Para uma falha
inesperada, a mensagem será genérica e o `requestId` permitirá relacioná-la
ao registro estruturado do Pino. O mesmo identificador será exposto no
cabeçalho `X-Request-Id` e no corpo de respostas de erro.

O limite de requisições passará a usar a mesma resposta JSON. Um middleware de
rota inexistente será montado depois das rotas de API e antes do fallback das
aplicações web, evitando que URLs de SPA sejam tratadas como endpoints.

## Aplicativos web

Cada cliente Axios continuará responsável por autenticação e renovação de
sessão, mas todos passarão a converter respostas HTTP, falha de rede e timeout
para uma estrutura comum de erro da interface. Essa estrutura terá código,
mensagem, status, identificador da requisição e mensagens por campo quando
existirem.

As três interfaces compartilharão uma pequena camada de apresentação para:

- avisar erros de operação por uma notificação discreta e acessível;
- apresentar uma mensagem com botão de tentar novamente para dados que não
  puderem ser carregados;
- mostrar as mensagens de validação junto aos campos quando a tela já possui
  formulário;
- manter erros locais já tratados pela tela sem repetir uma notificação;
- mostrar uma tela segura de recuperação se ocorrer uma exceção de renderização.

O agendamento público receberá também um `ErrorBoundary`, que hoje só existe
nos dois painéis internos. Erros 401 continuarão levando à autenticação quando
isso fizer sentido; 403 apenas informa falta de permissão e nunca redireciona.

## Mensagens esperadas

| Situação | Mensagem ou comportamento |
| --- | --- |
| Sem conexão ou timeout | Informa indisponibilidade e permite tentar novamente. |
| 401 | Solicita nova autenticação, preservando a renovação automática existente. |
| 403 | "Você não tem permissão para realizar esta ação." |
| 404 | Informa que o recurso não foi encontrado. |
| 409 | Mostra a orientação específica do conflito, como cadastro duplicado. |
| 422 | Mostra a mensagem geral e, quando houver, indica os campos inválidos. |
| 429 | Informa que há muitas tentativas e orienta aguardar. |
| 5xx | Mostra mensagem genérica com o código da solicitação para suporte. |

## Limites de escopo

Esta mudança não altera regras de negócio, permissões, cálculos financeiros ou
fluxos de agendamento. Ela padroniza apenas a forma de detectar, registrar e
exibir falhas. Não haverá dependência de serviços externos ou armazenamento de
telemetria no navegador.

## Verificação

Serão adicionados testes do manipulador de erros da API para os casos de
validação, duplicidade, autenticação, limite, rota ausente e erro inesperado.
As funções de normalização do navegador serão testadas para resposta da API,
rede e timeout. No fim serão executados os testes do servidor e o build de
todas as workspaces.
