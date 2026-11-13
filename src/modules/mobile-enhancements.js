import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth, requireRoles } from '../common/auth.js';
import { validate } from '../common/validate.js';
import { AppError, forbidden } from '../common/errors.js';
import { one } from '../db/pool.js';
import { verifyPassword } from '../services/passwords.js';
import { verifyGoogleIdToken } from '../services/google-auth.js';
import { deleteRoleAccount } from '../services/account-deletion.js';

import { getDraftForAccess, getReservationForAccess } from '../services/access.js';
import { loadDraftPaymentBreakdown, loadReservationPaymentBreakdown } from '../services/payment-breakdown.js';
import { addCustomerCharge } from '../services/customer-charges.js';
import { loadBookingOptions } from '../services/booking-options.js';
const router=Router();
const deletionLimiter=rateLimit({windowMs:15*60_000,limit:10,standardHeaders:true,legacyHeaders:false,
  handler:(_request,_response,next)=>next(new AppError(429,'ACCOUNT_DELETION_RATE_LIMITED','Too many account deletion attempts; try again later'))});
const positiveId=z.object({profileId:z.coerce.number().int().positive()});
const deletionBody=z.object({confirm:z.literal(true),reason:z.string().trim().max(1000).optional()});
router.delete('/auth/account',requireAuth,deletionLimiter,
  validate(deletionBody.extend({password:z.string().min(1).max(128).optional(),idToken:z.string().min(20).optional()})
    .refine(v=>Boolean(v.password)!==Boolean(v.idToken),'Provide either your password or a fresh Google idToken')),
  asyncHandler(async(request,response)=>{
    const role=Number(request.auth.role);
    if(![3,4,5].includes(role))throw forbidden('Only client, chauffeur and agent accounts can use self deletion');
    const user=await one('SELECT id,password FROM users WHERE id=? AND deleted_at IS NULL AND status=0',[request.auth.userId]);
    let verified=false;
    if(request.body.password)verified=Boolean(user)&&await verifyPassword(request.body.password,user.password);
    else{
      const identity=await verifyGoogleIdToken(request.body.idToken);
      const link=await one("SELECT user_id FROM app_user_oauth_accounts WHERE provider='google' AND provider_subject=? AND user_id=?",[identity.subject,request.auth.userId]);
      verified=Boolean(user&&link);
    }
    if(!verified)throw new AppError(401,'ACCOUNT_REAUTHENTICATION_FAILED','Confirm your account identity before deletion');
    const kind={3:'CHAUFFEUR',4:'AGENCY_AGENT',5:'CLIENT'}[role];
    const profileId={3:request.auth.driverId,4:request.auth.agentId,5:request.auth.customerId}[role];
    response.json(await deleteRoleAccount({kind,profileId,actor:request.auth,reason:request.body.reason}));
  }));
router.delete('/operations/clients/:profileId',requireAuth,requireRoles(1),validate(positiveId,'params'),validate(deletionBody),
  asyncHandler(async(request,response)=>response.json(await deleteRoleAccount({kind:'CLIENT',profileId:request.params.profileId,actor:request.auth,reason:request.body.reason}))));
router.delete('/operations/chauffeurs/:profileId',requireAuth,requireRoles(1),validate(positiveId,'params'),validate(deletionBody),
  asyncHandler(async(request,response)=>response.json(await deleteRoleAccount({kind:'CHAUFFEUR',profileId:request.params.profileId,actor:request.auth,reason:request.body.reason}))));
router.delete('/operations/agents/:profileId',requireAuth,requireRoles(1),validate(positiveId,'params'),validate(deletionBody),
  asyncHandler(async(request,response)=>response.json(await deleteRoleAccount({kind:'AGENCY_AGENT',profileId:request.params.profileId,actor:request.auth,reason:request.body.reason}))));
router.get('/catalog/vehicle-classes/:vehicleClassId/booking-options',
  validate(z.object({vehicleClassId:z.coerce.number().int().positive()}),'params'),
  validate(z.object({serviceCode:z.enum(['CHAUFFEUR','CAR_RENTAL','TRANSFER'])}),'query'),
  asyncHandler(async(request,response)=>response.json(await loadBookingOptions(request.params.vehicleClassId,request.query.serviceCode))));
router.get('/bookings/drafts/:draftId/payment-breakdown',requireAuth,requireRoles(1,2,4,5),
  validate(z.object({draftId:z.coerce.number().int().positive()}),'params'),
  asyncHandler(async(request,response)=>{
    const draft=await getDraftForAccess(request.auth,request.params.draftId);
    response.set('Cache-Control','no-store');response.json(await loadDraftPaymentBreakdown(draft));
  }));
router.get('/bookings/:reservationId/payment-breakdown',requireAuth,requireRoles(1,2,4,5),
  validate(z.object({reservationId:z.coerce.number().int().positive()}),'params'),
  asyncHandler(async(request,response)=>{
    await getReservationForAccess(request.auth,request.params.reservationId);
    response.set('Cache-Control','no-store');response.json(await loadReservationPaymentBreakdown(request.params.reservationId));
  }));
router.post('/operations/bookings/:reservationId/customer-charges',requireAuth,requireRoles(1),
  validate(z.object({reservationId:z.coerce.number().int().positive()}),'params'),
  validate(z.object({'idempotency-key':z.string().min(8).max(128)}).passthrough(),'headers'),
  validate(z.object({title:z.string().trim().min(1).max(191),amount:z.number().positive().max(1000000),expenseId:z.number().int().positive().optional()})),
  asyncHandler(async(request,response)=>{
    const result=await addCustomerCharge({reservationId:request.params.reservationId,actorUserId:request.auth.userId,
      ...request.body,idempotencyKey:request.get('Idempotency-Key')});
    response.status(result.reused?200:201).json(result);
  }));
export default router;
