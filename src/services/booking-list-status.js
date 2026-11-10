/**
 * Filter options for the customer booking list.
 * The unfiltered list intentionally includes unpaid bookings, so PAY_LATER
 * and failed-payment reservations never disappear from My Bookings.
 */
export const bookingListStatusCondition = (status) => {
  if (status == null || status === '') return { clause: null, params: [] };

  if (status === 'UNPAID' || status === 'PAYMENT_REQUIRED') {
    return {
      clause: `r.status<>3 AND arm.lifecycle_status NOT IN ('PAYMENT_PENDING','CANCELLED','REJECTED')
        AND (SELECT COALESCE(SUM(c.total_amount),0) FROM reservation_costs c
          JOIN reservation_details d ON d.id=c.reservation_details_id AND d.status=1 AND d.deleted_at IS NULL
          WHERE c.reservation_id=r.id AND c.status=1) >
        (SELECT COALESCE(SUM(paid.payment_amount),0) FROM reservation_payments paid
          WHERE paid.reservation_id=r.id AND paid.status=1 AND paid.deleted_at IS NULL
            AND (paid.custom_invoices IS NULL OR paid.custom_invoices=0))`,
      params: [],
    };
  }

  if (status === 'UPCOMING') {
    return {
      clause: `arm.lifecycle_status NOT IN ('COMPLETED','CANCELLED','REJECTED')
        AND EXISTS (
          SELECT 1 FROM reservation_details upcoming_leg
          WHERE upcoming_leg.reservation_id=r.id
            AND upcoming_leg.deleted_at IS NULL
            AND upcoming_leg.pick_up_date >= CURRENT_DATE
        )`,
      params: [],
    };
  }

  // Preserve exact lifecycle filtering for existing app clients.
  return { clause: 'arm.lifecycle_status = ?', params: [status] };
};
