export const writeActivityLog = async (
  connection,
  {
    subjectType,
    subjectId,
    featureName,
    featureId = null,
    action,
    description = null,
    oldValues = null,
    newValues = null,
    userId = null,
    ipAddress = null,
  },
) => {
  await connection.execute(
    `INSERT INTO activity_logs
      (subject_type,subject_id,feature_name,features_id,action,description,old_values,new_values,
       user_id,ip_address,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
    [
      subjectType,
      subjectId,
      featureName,
      featureId,
      action,
      description?.slice(0, 191) ?? null,
      oldValues === null ? null : JSON.stringify(oldValues),
      newValues === null ? null : JSON.stringify(newValues),
      userId,
      ipAddress,
    ],
  );
};
