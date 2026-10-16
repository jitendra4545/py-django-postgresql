export const supplied = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export const buildProfileUpdate = (body, columnMap) => {
  const entries = Object.entries(columnMap).filter(([field]) => supplied(body, field));
  if (!entries.length) return null;
  return {
    assignments: entries.map(([, column]) => `${column}=?`).join(','),
    values: entries.map(([field]) => body[field]),
  };
};

export const updateProfileTable = async (connection, table, id, body, columnMap) => {
  const update = buildProfileUpdate(body, columnMap);
  if (!update) return false;
  await connection.execute(
    `UPDATE ${table} SET ${update.assignments},updated_at=NOW() WHERE id=?`,
    [...update.values, id],
  );
  return true;
};
