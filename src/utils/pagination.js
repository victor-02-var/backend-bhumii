'use strict';
/** Reusable pagination helper */

function getPagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

function paginatedResponse(data, count, page, limit) {
  return {
    data,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  };
}

module.exports = { getPagination, paginatedResponse };
