/** The legacy migrations can finish with explanatory '--' comments.
 * Never send a comment-only fragment to MySQL as an empty SQL command.
 * Keep original statement boundaries and checksum bytes unchanged.
 */
export const splitMigrationStatements = (sql) =>
  sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((item) => item.trim())
    .filter((item) =>
      item.split(/\r?\n/).some((line) => {
        const text = line.trim();
        return text && !text.startsWith('--') && !text.startsWith('#');
      }),
    );
