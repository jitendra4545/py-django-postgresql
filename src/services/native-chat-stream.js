import {query,one} from '../db/pool.js';
import {emitToConversation} from './realtime.js';

// Process-local delivery cursor. REST history remains the recovery source after
// restarts/disconnections; clients deduplicate message.created by message ID.
export function createNativeChatStream(){
  let cursor=null,running=false;
  const seen=new Set();
  return async()=>{
    if(running)return;running=true;
    try{
      if(cursor===null){cursor=Number((await one('SELECT COALESCE(MAX(id),0) AS id FROM reservation_messages')).id);return;}
      const select=`SELECT m.id,m.reservation_id,m.sender_id AS senderUserId,u.full_name AS senderName,
        m.body,m.mobile_document_id AS documentId,m.created_at AS createdAt,c.id AS conversationId
        FROM reservation_messages m JOIN users u ON u.id=m.sender_id
        JOIN app_conversations c ON c.reservation_id=m.reservation_id
        WHERE m.mobile_message_id IS NULL AND m.deleted_at IS NULL
          AND `;
      const fresh=await query(select+'m.id>? ORDER BY m.id LIMIT 200',[cursor]);
      const lookback=await query(select+'m.id<=? AND m.created_at>=DATE_SUB(NOW(),INTERVAL 60 SECOND) ORDER BY m.id DESC LIMIT 200',[cursor]);
      const rows=[...fresh,...lookback];
      for(const row of rows){
        if(seen.has(row.id))continue;
        const delivered=await emitToConversation(row.conversationId,'message.created',{
          id:row.id,conversationId:row.conversationId,senderUserId:row.senderUserId,senderName:row.senderName,
          messageType:row.documentId?'FILE':'TEXT',body:row.body,documentId:row.documentId,createdAt:row.createdAt,
        });
        if(delivered!==false){seen.add(row.id);cursor=Math.max(cursor,Number(row.id));}
      }
      // IDs are monotonically allocated; bounded lookback covers normal commit
      // reordering. Long transactions and offline delivery recover through GET.
      if(seen.size>2000)for(const id of [...seen].sort((a,b)=>a-b).slice(0,1000))seen.delete(id);
    }finally{running=false;}
  };
}
