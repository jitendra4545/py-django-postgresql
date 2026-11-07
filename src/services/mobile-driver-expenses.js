/**
 * Chauffeur outlays belong to reservation_other_costs but are never billable
 * legacy customer costs. A zero website `amount` prevents double-charging;
 * the true outlay is stored in `mobile_expense_amount`.
 * Public IDs come from a separate allocator so PHP cost row IDs do not change.
 */
export const MOBILE_DRIVER_EXPENSE_TYPE = 'MOBILE_DRIVER_EXPENSE';

export const addMobileDriverExpense = async (connection, {
  assignmentId,
  reservationId,
  reservationDetailsId,
  driverId,
  submittedByUserId,
  category,
  amount,
  currency,
  description = null,
  documentId = null,
  incurredAt,
}) => {
  const [publicId] = await connection.execute(
    'INSERT INTO app_mobile_expense_ids VALUES (NULL)',
  );
  await connection.execute(
    `INSERT INTO reservation_other_costs
       (reservation_id,reservation_details_id,amount,type,note,user_id,created_at,updated_at,
        mobile_expense_id,mobile_assignment_id,mobile_driver_id,mobile_category,
        mobile_expense_amount,mobile_currency,mobile_description,mobile_document_id,
        mobile_expense_status,mobile_incurred_at)
     VALUES (?,?,0,'MOBILE_DRIVER_EXPENSE',NULL,?,NOW(),NOW(),?,?,?,?,?,?,?,?,'SUBMITTED',?)`,
    [
      reservationId,
      reservationDetailsId,
      submittedByUserId,
      publicId.insertId,
      assignmentId,
      driverId,
      category,
      amount,
      currency,
      description,
      documentId,
      incurredAt,
    ],
  );
  return { insertId: publicId.insertId };
};
