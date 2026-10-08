export const pagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const perPage = Math.min(Math.max(Number(query.perPage) || 20, 1), 100);
  return { page, perPage, offset: (page - 1) * perPage };
};

export const pageResponse = (items, total, page, perPage) => ({
  items,
  meta: {
    page,
    perPage,
    total,
    pages: Math.ceil(total / perPage),
  },
});
