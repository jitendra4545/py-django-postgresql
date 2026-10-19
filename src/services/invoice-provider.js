import { AppError } from '../common/errors.js';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

const firstDefined = (row, keys) =>
  keys.map((key) => row[key]).find((value) => value != null) ?? null;

export const normalizeInvoice = (row) => ({
  id: row.id,
  invoiceNumber: firstDefined(row, ['invoice_id', 'invoice_number', 'invoice_no', 'number']),
  status: firstDefined(row, ['status', 'payment_status']),
  currency: firstDefined(row, ['currency', 'currency_code']),
  subtotalAmount: firstDefined(row, ['subtotal_amount', 'sub_total', 'subtotal']),
  taxAmount: firstDefined(row, ['tax_amount', 'tax']),
  totalAmount: firstDefined(row, ['total_amount', 'grand_total', 'total']),
  issuedAt: firstDefined(row, ['issued_at', 'invoice_date', 'created_at']),
  dueAt: firstDefined(row, ['due_at', 'due_date']),
  documentId: firstDefined(row, ['document_id', 'app_document_id']),
});

export const listReservationInvoices = async (reservationId) => {
  if (env.INVOICE_ADAPTER === 'disabled') {
    throw new AppError(
      503,
      'INVOICE_ADAPTER_NOT_CONFIGURED',
      'Invoice access is prepared but the legacy invoice table mapping is not configured',
    );
  }
  if (env.LEGACY_INVOICE_TABLE === 'reservation_invoices') {
    const rows = await query(
      `SELECT ri.id,ri.invoice_id,ri.invoice_type,ri.payment_status,ri.created_at,
              COALESCE(SUM(rid.price),0) AS subtotal_amount,
              COALESCE(SUM(rid.tax_amount),0) AS tax_amount,
              COALESCE(SUM(rid.total_price),0) AS total_amount
         FROM reservation_invoices ri
         LEFT JOIN reservation_invoice_details rid ON rid.reservation_invoice_id=ri.id
        WHERE ri.reservation_id=?
        GROUP BY ri.id,ri.invoice_id,ri.invoice_type,ri.payment_status,ri.created_at
        ORDER BY ri.id DESC`,
      [reservationId],
    );
    return rows.map((row) => ({ ...normalizeInvoice(row), invoiceType: row.invoice_type }));
  }
  const rows = await query(
    `SELECT * FROM \`${env.LEGACY_INVOICE_TABLE}\`
      WHERE \`${env.LEGACY_INVOICE_RESERVATION_COLUMN}\`=? ORDER BY id DESC`,
    [reservationId],
  );
  return rows.map(normalizeInvoice);
};
