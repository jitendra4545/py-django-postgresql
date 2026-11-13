import { ensureNativeAssignmentIdentity } from './native-assignment-identity.js';
// Internal outlays are separate from native customer billable costs.
export const MOBILE_DRIVER_EXPENSE_TYPE = 'MOBILE_DRIVER_EXPENSE';
export async function addMobileDriverExpense(connection,{assignmentId,reservationId,driverId,category,amount,currency,description=null,documentId=null,incurredAt}) {
 await ensureNativeAssignmentIdentity(connection,assignmentId);
 const [result]=await connection.execute(`INSERT INTO app_driver_expenses
 (assignment_id,reservation_id,driver_id,category,amount,currency,description,document_id,status,incurred_at,created_at,updated_at)
 VALUES (?,?,?,?,?,?,?,?,'SUBMITTED',?,NOW(),NOW())`,[assignmentId,reservationId,driverId,category,amount,currency,description,documentId,incurredAt]);
 return result;
}
