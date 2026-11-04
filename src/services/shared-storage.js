import { randomUUID } from 'node:crypto';

// These functions write the client's real tables. dl_mobile_* objects are
// read-only SQL views, not additional copies of business records.
export const legacyText = (value, length = 191) =>
  value == null ? null : Array.from(String(value)).slice(0, length).join('');

export const setReservationMetadata = async (connection, value) => {
  await connection.execute(
    `UPDATE reservations SET mobile_service_code=?,mobile_source_channel=?,
       mobile_created_by_user_id=?,mobile_created_by_agent_id=?,mobile_lifecycle_status=?,
       mobile_currency_code=?,mobile_quote_snapshot_id=?,mobile_legacy_status=status,
       mobile_created_at=COALESCE(mobile_created_at,NOW()),mobile_updated_at=NOW(),mobile_storage_version=1
     WHERE id=?`,
    [value.serviceCode, value.sourceChannel, value.userId, value.agentId ?? null,
      value.status, value.currency, value.quoteSnapshotId ?? null, value.reservationId],
  );
};

export const syncFlightNumber = async (connection, { reservationId, detailId, flightNumber }) => {
  // A dedicated key on the EXISTING flight table makes retries safe without
  // deleting or rewriting flight rows created by the client's application.
  await connection.execute(
    `INSERT INTO reservation_flight_numbers
       (reservation_id,reservation_details_id,flight_number,mobile_entry_key,created_at,updated_at)
     VALUES (?,?,?,?,NOW(),NOW())
     ON DUPLICATE KEY UPDATE flight_number=VALUES(flight_number),updated_at=NOW()`,
    [reservationId, detailId, flightNumber ?? null, `mobile-leg:${detailId}`],
  );
};

export const setLegMetadata = async (connection, value) => {
  await connection.execute(
    `UPDATE reservation_details SET mobile_sequence_no=COALESCE(?,mobile_sequence_no),
       mobile_vehicle_class_id=?,mobile_passenger_count=?,mobile_luggage_count=?,
       mobile_pickup_details=?,mobile_dropoff_details=?,
       mobile_leg_status=COALESCE(?,mobile_leg_status),
       mobile_created_at=COALESCE(mobile_created_at,NOW()),mobile_updated_at=NOW(),mobile_storage_version=1
     WHERE id=? AND reservation_id=?`,
    [value.sequenceNo ?? null, value.vehicleClassId, value.passengerCount ?? 1,
      value.luggageCount ?? 0, JSON.stringify(value.pickup), JSON.stringify(value.dropoff ?? {}),
      value.status ?? null, value.detailId, value.reservationId],
  );
  await syncFlightNumber(connection, value);
};

export const createSharedAssignment = async (connection, value) => {
  const [result] = await connection.execute(
    `INSERT INTO reservation_drivers
       (reservation_id,reservation_details_id,pick_up_date,pick_up_time,pick_up_driver_id,
        drop_off_date,drop_off_time,user_id,status,mobile_assignment_status,mobile_status_driver_id,
        mobile_assigned_by_user_id,mobile_created_at,mobile_updated_at,created_at,updated_at)
     VALUES (?,?,DATE(?),TIME(?),?,DATE(?),TIME(?),?,1,'OFFERED',?,?,NOW(),NOW(),NOW(),NOW())`,
    [value.reservationId, value.detailId, value.startAt, value.startAt, value.driverId,
      value.endAt, value.endAt, value.userId, value.driverId, value.userId],
  );
  await connection.execute(
    'UPDATE reservation_drivers SET mobile_assignment_id=id WHERE id=?', [result.insertId],
  );
  return result;
};

// Website-created rows have no mobile alias until first used by a mobile action.
// Migration reserves a collision-free AUTO_INCREMENT range, so their native ID
// can be used without changing any historical mobile assignment IDs.
export const materializeAssignmentId = async (connection, assignmentId, driverId) => {
  await connection.execute(
    `UPDATE reservation_drivers SET mobile_assignment_id=id
      WHERE mobile_assignment_id IS NULL AND id=?
        AND COALESCE(pick_up_driver_id,drop_off_driver_id)=? AND deleted_at IS NULL`,
    [assignmentId, driverId],
  );
  // A PHP edit may replace the primary driver without inserting another row.
  // Do not let the replacement inherit the previous driver's progress/consent.
  await connection.execute(
    `UPDATE reservation_drivers SET mobile_assignment_status='OFFERED',
       mobile_status_driver_id=?,mobile_acknowledged_at=NULL,mobile_declined_at=NULL,
       mobile_decline_reason=NULL,mobile_started_at=NULL,mobile_completed_at=NULL,mobile_updated_at=NOW()
      WHERE COALESCE(mobile_assignment_id,id)=? AND COALESCE(pick_up_driver_id,drop_off_driver_id)=?
        AND mobile_status_driver_id IS NOT NULL AND mobile_status_driver_id<>? AND status=1 AND deleted_at IS NULL`,
    [driverId, assignmentId, driverId, driverId],
  );
};

export const recordSharedTripStatus = async (connection, { assignment, status, userId, note = null }) => {
  const [matches] = await connection.execute(
    `SELECT id FROM reservation_statuses
      WHERE status=1 AND UPPER(REPLACE(slug,'-','_'))=? ORDER BY id LIMIT 2`, [status],
  );
  // Do not guess client-specific status IDs. An unambiguous slug is the only
  // automatic match; otherwise the detailed mobile state remains available.
  const mappedId = matches.length === 1 ? matches[0].id : null;
  await connection.execute(
    `UPDATE reservation_details SET mobile_leg_status=?,mobile_updated_at=NOW(),
       trip_status_id=COALESCE(?,trip_status_id),
       mobile_status_synced_trip_id=COALESCE(?,trip_status_id),
       trip_status_updated_by=IF(? IS NULL,trip_status_updated_by,?),
       trip_status_updated_at=IF(? IS NULL,trip_status_updated_at,NOW()) WHERE id=?`,
    [status, mappedId, mappedId, mappedId, userId, mappedId, assignment.reservation_details_id],
  );
  await connection.execute(
    `INSERT INTO reservation_driver_statuses
       (reservation_id,reservation_details_id,driver_id,reservation_status_id,status,note,source,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'mobile_app',NOW(),NOW())`,
    [assignment.reservation_id, assignment.reservation_details_id, assignment.driver_id,
      mappedId, status, legacyText(note, 500)],
  );
};

export const createSharedMessage = async (connection, value) => {
  const [created] = await connection.execute(
    `INSERT INTO reservation_messages
       (reservation_id,sender_id,body,mobile_message_type,mobile_document_id,created_at,updated_at)
     VALUES (?,?,?,?,?,NOW(),NOW())`,
    [value.reservationId, value.userId, value.body ?? null, value.messageType, value.documentId ?? null],
  );
  await connection.execute('UPDATE reservation_messages SET mobile_message_id=id WHERE id=?', [created.insertId]);
  await connection.execute(
    `INSERT INTO reservation_message_recipients (reservation_message_id,user_id,created_at,updated_at)
     SELECT ?,user_id,NOW(),NOW() FROM app_conversation_participants
      WHERE conversation_id=? AND user_id<>? AND left_at IS NULL`,
    [created.insertId, value.conversationId, value.userId],
  );
  if (value.documentId) {
    const [documents] = await connection.execute(
      'SELECT storage_disk,storage_key,original_name,mime_type,size_bytes FROM app_documents WHERE id=? AND deleted_at IS NULL',
      [value.documentId],
    );
    const document = documents[0];
    // Preserve private/local-file authorization through the existing document
    // API. Only a representable shared object-storage path is mirrored here.
    if (document && document.storage_disk === 'spaces' && Array.from(document.storage_key).length <= 191) {
      await connection.execute(
        `INSERT INTO reservation_message_attachments
           (reservation_message_id,disk,path,original_name,mime_type,size,created_at,updated_at)
         VALUES (?,?,?,?,?,?,NOW(),NOW())`,
        [created.insertId, document.storage_disk, document.storage_key,
          legacyText(document.original_name), document.mime_type, document.size_bytes],
      );
    }
  }
  return created;
};

// A native reservation message may be an internal staff message. Membership of
// the mobile conversation alone must NEVER reveal such a message to a client.
export const sharedMessageVisibility = (alias, auth) => {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new TypeError('Invalid SQL alias');
  const userId = Number(auth.userId);
  const role = Number(auth.role);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(role)) {
    throw new TypeError('Invalid authenticated message principal');
  }
  if ([1, 2].includes(role)) return '1=1';
  return `(${alias}.is_mobile=1 OR ${alias}.sender_user_id=${userId} OR EXISTS (
    SELECT 1 FROM reservation_message_recipients mr
     WHERE mr.reservation_message_id=${alias}.legacy_message_id AND mr.user_id=${userId}))`;
};

export const markSharedMessagesRead = async (connection, { conversationId, userId, readAt }) => {
  await connection.execute(
    `UPDATE reservation_message_recipients rr
       JOIN reservation_messages m ON m.id=rr.reservation_message_id
       JOIN app_conversations c ON c.reservation_id=m.reservation_id
        SET rr.read_at=COALESCE(rr.read_at,?),rr.updated_at=NOW()
      WHERE c.id=? AND rr.user_id=? AND m.deleted_at IS NULL AND m.created_at<=?`,
    [readAt, conversationId, userId, readAt],
  );
};

export const createSharedNotification = async (connection, value) => {
  const [settings] = await connection.execute(
    "SELECT option_value FROM app_settings WHERE option_key='dl.mobile.notification_model' ORDER BY id LIMIT 1",
  );
  const model = settings[0]?.option_value;
  if (!model) throw new Error('Shared notification model is not configured; run migration 008');
  const [result] = await connection.execute(
    `INSERT INTO notifications
       (id,type,notifiable_type,notifiable_id,data,mobile_origin,created_at,updated_at)
     VALUES (?,?,?,?,?,'MOBILE_API',NOW(),NOW())`,
    [randomUUID(), value.type, model, value.userId,
      JSON.stringify({ title: value.title, body: value.body, data: value.data ?? {} })],
  );
  return result.insertId; // AUTO_INCREMENT mobile_id; the client's UUID is unchanged.
};

export const createSharedManualRequest = async (connection, value) => {
  if (!['AIRPORT_VIP', 'CONCIERGE'].includes(value.kind)) throw new TypeError('Unknown request kind');
  const [customers] = await connection.execute(
    'SELECT full_name,last_name,email,phone_no FROM customers WHERE id=? AND deleted_at IS NULL', [value.customerId],
  );
  if (!customers[0]) throw new Error('Customer disappeared while creating manual request');
  const customer = customers[0];
  const serviceAt = value.serviceAt ?? value.requestedFor ?? null;
  const [result] = await connection.execute(
    `INSERT INTO contacts
       (first_name,last_name,email,phone,subject,message_details,service_type,
        pickup_location,pickup_date,pickup_time,pick_up_city,number_of_passengers,flight_train_number,
        mobile_request_type,mobile_customer_id,mobile_agency_id,mobile_created_by_user_id,
        mobile_terminal,mobile_category,mobile_request_text_null,mobile_request_status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,DATE(?),TIME(?),?,?,?,?,?,?,?,?,?,?,'SUBMITTED',NOW(),NOW())`,
    [legacyText(customer.full_name), legacyText(customer.last_name), customer.email ?? '', customer.phone_no,
      value.kind === 'AIRPORT_VIP' ? 'Airport VIP request' : 'Concierge request', value.requestText ?? '',
      value.kind, value.airport ?? null, serviceAt, serviceAt, value.city ?? null,
      value.passengerCount ?? null, value.flightNumber ?? null, value.kind, value.customerId,
      value.agencyId ?? null, value.userId, value.terminal ?? null, value.category ?? null,
      value.requestText == null ? 1 : 0],
  );
  return result;
};
