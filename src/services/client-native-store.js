import { env } from '../config/env.js';
import { randomUUID, createHash } from 'node:crypto';

export async function insertNativeNotification(connection, { userId, type, title, body, data = {} }) {
  const uuid = randomUUID();
  await connection.execute(`INSERT INTO notifications
    (id,type,notifiable_type,notifiable_id,data,created_at,updated_at)
    VALUES (?,?,?,?,?,NOW(),NOW())`,
  [uuid,type,env.LEGACY_USER_MODEL,userId,JSON.stringify({ title,body,...data })]);
  const [rows] = await connection.execute('SELECT mobile_notification_id AS id FROM notifications WHERE id=?',[uuid]);
  return { insertId: rows[0].id };
}

export async function insertNativeMessage(connection, { conversationId, userId, body, documentId }) {
  const [rows] = await connection.execute('SELECT reservation_id FROM app_conversations WHERE id=? FOR UPDATE',[conversationId]);
  if (!rows[0]) throw new Error('Conversation does not exist');
  const [result] = await connection.execute(`INSERT INTO reservation_messages
    (reservation_id,sender_id,body,mobile_document_id,created_at,updated_at) VALUES (?,?,?,?,NOW(),NOW())`,
  [rows[0].reservation_id,userId,body ?? null,documentId ?? null]);
  await connection.execute('UPDATE reservation_messages SET mobile_message_id=id WHERE id=?',[result.insertId]);
  await connection.execute(`INSERT IGNORE INTO reservation_message_recipients
    (reservation_message_id,user_id,created_at,updated_at)
    SELECT ?,user_id,NOW(),NOW() FROM app_conversation_participants WHERE conversation_id=? AND left_at IS NULL`,[result.insertId,conversationId]);
  if (documentId) {
    const [files] = await connection.execute('SELECT * FROM file_managers WHERE mobile_document_id=? AND deleted_at IS NULL',[documentId]);
    const file=files[0];
    if (!file) throw new Error('Document does not exist');
    await connection.execute(`INSERT INTO reservation_message_attachments
      (reservation_message_id,disk,path,original_name,mime_type,size,created_at,updated_at)
      SELECT ?,disk,?, ?, mime_type,size,NOW(),NOW() FROM media_files WHERE id=?`,
    [result.insertId,file.file_path,file.mobile_original_name ?? file.file_org_name,file.mobile_media_file_id]);
  }
  return result;
}

export async function insertNativeDocument(connection, { userId,reservationId,category,name,disk,key,mime,size,expiresAt }) {
  const [media] = await connection.execute(`INSERT INTO media_files
    (path_hash,path,disk,source,size,mime_type,created_at,updated_at)
    VALUES (?,?,?,'mobile',?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
  [createHash('sha1').update(disk+':'+key).digest('hex'),key,disk,size,mime]);
  const [file] = await connection.execute(`INSERT INTO file_managers
    (uuid,bucket_type,base_url,file_path,file_org_name,file_extraction,created_by,created_at,updated_at,
     mobile_category,mobile_expires_at,mobile_visibility,mobile_original_name,mobile_media_file_id)
    VALUES (?,?,?, ?,?,?,?,NOW(),NOW(),?,?,'PRIVATE',?,?)`,
  [randomUUID(),disk,'',key,name.slice(0,191),name.split('.').pop() ?? '',userId,category,expiresAt,name,media.insertId]);
  await connection.execute('UPDATE file_managers SET mobile_document_id=id WHERE id=?',[file.insertId]);
  if (reservationId) await connection.execute(`INSERT INTO reservation_files
    (reservation_id,file_path,mobile_file_manager_id,user_id,created_at,updated_at) VALUES (?,?,?,?,NOW(),NOW())`,[reservationId,key,file.insertId,userId]);
  else {
    const [customers]=await connection.execute('SELECT id FROM customers WHERE user_id=? AND deleted_at IS NULL',[userId]);
    const [drivers]=await connection.execute('SELECT id FROM drivers WHERE user_id=? AND deleted_at IS NULL',[userId]);
    if(customers[0]) await connection.execute('INSERT INTO customer_files (customer_id,file_path,mobile_file_manager_id,created_at,updated_at) VALUES (?,?,?,NOW(),NOW())',[customers[0].id,key,file.insertId]);
    if(drivers[0]) await connection.execute('INSERT INTO driver_files (driver_id,file_path,mobile_file_manager_id,created_at,updated_at) VALUES (?,?,?,NOW(),NOW())',[drivers[0].id,key,file.insertId]);
  }
  return file;
}

export async function insertNativeInquiry(connection,{kind,customerId,agencyId,userId,details}) {
  const [customers]=await connection.execute('SELECT full_name,email,phone_no FROM customers WHERE id=?',[customerId]);
  const c=customers[0]; if(!c)throw new Error('Customer not found');
  const [result]=await connection.execute(`INSERT INTO contacts
    (first_name,email,phone,subject,message_details,service_type,pickup_location,pickup_date,pickup_time,
     flight_train_number,number_of_passengers,metadata,mobile_request_kind,mobile_customer_id,
     mobile_agency_id,mobile_created_by_user_id,mobile_request_status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'SUBMITTED',NOW(),NOW())`,
  [c.full_name,c.email??'',c.phone_no??'',kind,details.requestText??'',kind,details.airport??details.city??null,
   details.serviceAt?.slice(0,10)??null,details.serviceAt?.slice(11,19)??null,details.flightNumber??null,details.passengerCount??null,
   JSON.stringify({mobile:details}),kind,customerId,agencyId,userId]);
  await connection.execute('UPDATE contacts SET mobile_request_id=id WHERE id=?',[result.insertId]);
  return result;
}
