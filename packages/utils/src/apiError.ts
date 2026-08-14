export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_RESOURCE'
  | 'CONFLICT'
  | 'INVALID_IDENTIFIER'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPLOAD_INVALID_FILE'
  | 'UPLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT';

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
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_ERROR_EVENT = 'barber:api-error';

export interface ApiErrorNotice {
  error: ApiError;
  retry?: () => Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function detailsFrom(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;

  const details = Object.entries(value).reduce<Record<string, string>>((result, [field, message]) => {
    if (typeof message === 'string') result[field] = message;
    return result;
  }, {});

  return Object.keys(details).length > 0 ? details : undefined;
}

function codeForStatus(status?: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'UPLOAD_TOO_LARGE';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status && status >= 500) return 'INTERNAL_ERROR';
  return 'BAD_REQUEST';
}

function messageFor(code: ApiErrorCode): string {
  const messages: Record<ApiErrorCode, string> = {
    BAD_REQUEST: 'Não foi possível concluir a solicitação.',
    VALIDATION_ERROR: 'Revise os campos informados.',
    DUPLICATE_RESOURCE: 'Já existe um cadastro com estes dados.',
    CONFLICT: 'Esta ação não pode ser concluída no momento.',
    INVALID_IDENTIFIER: 'O identificador informado é inválido.',
    UNAUTHORIZED: 'Sua sessão não é válida. Entre novamente.',
    FORBIDDEN: 'Você não tem permissão para realizar esta ação.',
    NOT_FOUND: 'O recurso solicitado não foi encontrado.',
    RATE_LIMITED: 'Há muitas tentativas. Aguarde um momento e tente novamente.',
    UPLOAD_INVALID_FILE: 'O arquivo enviado não é válido.',
    UPLOAD_TOO_LARGE: 'O arquivo excede o tamanho máximo permitido.',
    INTERNAL_ERROR: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
    NETWORK_ERROR: 'Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.',
    TIMEOUT: 'A solicitação demorou demais. Tente novamente.',
  };

  return messages[code];
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const source = isRecord(error) ? error : {};
  const response = isRecord(source.response) ? source.response : undefined;
  const payload = response && isRecord(response.data) ? response.data : undefined;
  const status = typeof response?.status === 'number' ? response.status : undefined;
  const sourceCode = typeof source.code === 'string' ? source.code : undefined;

  if (sourceCode === 'ECONNABORTED' || sourceCode === 'ETIMEDOUT') {
    return new ApiError(messageFor('TIMEOUT'), 'TIMEOUT', undefined, undefined, undefined, source.response, source.config);
  }

  if (!response && source.request) {
    return new ApiError(messageFor('NETWORK_ERROR'), 'NETWORK_ERROR', undefined, undefined, undefined, source.response, source.config);
  }

  const payloadCode = typeof payload?.code === 'string' ? payload.code as ApiErrorCode : undefined;
  const code = payloadCode ?? codeForStatus(status);
  const message = typeof payload?.message === 'string' ? payload.message : messageFor(code);
  const requestId = typeof payload?.requestId === 'string' ? payload.requestId : undefined;

  return new ApiError(message, code, status, requestId, detailsFrom(payload?.details), source.response, source.config);
}

export function reportApiError(error: unknown, retry?: () => Promise<unknown>): void {
  if (typeof window === 'undefined') return;

  const detail: ApiErrorNotice = { error: normalizeApiError(error), retry };
  window.dispatchEvent(new CustomEvent<ApiErrorNotice>(API_ERROR_EVENT, { detail }));
}
