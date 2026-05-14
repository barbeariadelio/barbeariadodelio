export interface PaginationQuery {
  page?: string;
  limit?: string;
}

export function parsePagination(query: PaginationQuery) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(1000, Number(query.limit) || 20);
  return { page, limit, skip: (page - 1) * limit };
}
