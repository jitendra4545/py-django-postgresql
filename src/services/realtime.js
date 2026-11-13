import { verifyAccessToken } from './tokens.js';
import { one, transaction } from '../db/pool.js';
import { assertConversationAccess, reconcileConversationAudience } from './conversation-audience.js';

let socketServer = null;
const conversationIdFrom = input => Number(input?.conversationId ?? input);
export const registerSocketServer = (io) => {
  socketServer = io;
  io.use(async (socket, next) => {
    try {
      const authorization=socket.handshake.headers?.authorization;
      const token=socket.handshake.auth?.token ?? socket.handshake.auth?.accessToken ??
        (authorization?.startsWith('Bearer ')?authorization.slice(7):null);
      const payload=verifyAccessToken(token);
      const user=await one('SELECT id,role FROM users WHERE id=? AND status=0 AND deleted_at IS NULL',[payload.sub]);
      if(!user||Number(user.role)!==Number(payload.role))return next(new Error('unauthorized'));
      socket.data.user=user;return next();
    }catch{return next(new Error('unauthorized'));}
  });
  io.on('connection', socket => {
    socket.join(`user:${socket.data.user.id}`);
    socket.emit('session.ready',{recovered:socket.recovered,serverTime:new Date().toISOString()});
    socket.on('conversation.join',async(input,callback)=>{
      const acknowledge=typeof callback==='function'?callback:()=>{};
      const conversationId=conversationIdFrom(input);
      if(!Number.isSafeInteger(conversationId)||conversationId<=0)return acknowledge({ok:false,error:'invalid_conversation'});
      try{
        const active=await one('SELECT id,role FROM users WHERE id=? AND status=0 AND deleted_at IS NULL',[socket.data.user.id]);
        if(!active||Number(active.role)!==Number(socket.data.user.role)){socket.disconnect(true);return acknowledge({ok:false,error:'unauthorized'});}
        await assertConversationAccess({userId:active.id,role:Number(active.role)},conversationId);
        await socket.join(`conversation:${conversationId}`);return acknowledge({ok:true});
      }catch(error){return acknowledge({ok:false,error:[403,404].includes(error.status)?'forbidden':'internal_error'});}
    });
    socket.on('conversation.leave',async(input,callback)=>{
      const acknowledge=typeof callback==='function'?callback:()=>{};
      const conversationId=conversationIdFrom(input);
      if(!Number.isSafeInteger(conversationId)||conversationId<=0)return acknowledge({ok:false,error:'invalid_conversation'});
      await socket.leave(`conversation:${conversationId}`);return acknowledge({ok:true});
    });
  });
};
export const emitToUser=(userId,event,payload)=>socketServer?.to(`user:${userId}`).emit(event,payload);
export async function emitToConversation(conversationId,event,payload){
  if(!socketServer)return;
  try {
  const audience=await transaction(c=>reconcileConversationAudience(c,{conversationId}));
  const allowed=new Set(audience?.participants??[]);
  // A previously joined socket can outlive a native driver reassignment. Check
  // the authoritative audience before broadcasting, including recovered rooms.
  const room=`conversation:${conversationId}`;
  for(const socket of await socketServer.in(room).fetchSockets()){
    if(!allowed.has(Number(socket.data.user?.id)))await socket.leave(room);
  }
  socketServer.to(room).emit(event,payload);
  return true;
  }catch(error){
    console.warn('Conversation broadcast unavailable',{code:error.code??error.name});
    return false; // The REST write already committed; polling can recover it.
  }
}
export const removeUserFromConversation=(userId,conversationId)=>socketServer?.in(`user:${userId}`).socketsLeave(`conversation:${conversationId}`);
export const disconnectUser=userId=>socketServer?.in(`user:${userId}`).disconnectSockets(true);
