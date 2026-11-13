import {beforeEach,describe,it,expect,vi} from 'vitest';
const gateway=vi.hoisted(()=>({retrieve:vi.fn(),cancel:vi.fn(),create:vi.fn()}));
vi.mock('../src/config/env.js',()=>({env:{PAYMENT_PROVIDER:'stripe',STRIPE_SECRET_KEY:'test',STRIPE_PUBLISHABLE_KEY:'pk_test',STRIPE_TIMEOUT_MS:1000,STRIPE_MAX_NETWORK_RETRIES:0}}));
vi.mock('stripe',()=>({default:class{paymentIntents=gateway;}}));
import {cancelAbandonedPayment,createPaymentIntent} from '../src/services/payment-provider.js';
import {updatedProviderPayload} from '../src/services/booking-payment-policy.js';
describe('safe balance intent replacement',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it.each(['succeeded','processing','requires_capture'])('never replaces a %s intent',async status=>{
  gateway.retrieve.mockResolvedValue({status});expect(await cancelAbandonedPayment('stripe','pi_old')).toBe(false);expect(gateway.cancel).not.toHaveBeenCalled();
 });
 it('requires confirmed gateway cancellation before replacing a stale payable amount',async()=>{
  gateway.retrieve.mockResolvedValue({status:'requires_action'});gateway.cancel.mockResolvedValue({status:'canceled'});
  expect(await cancelAbandonedPayment('stripe','pi_old')).toBe(true);expect(gateway.cancel).toHaveBeenCalledWith('pi_old');
 });
 it('uses a distinct durable idempotency key for the replacement attempt',async()=>{
  gateway.create.mockResolvedValue({id:'pi_new',status:'requires_payment_method',client_secret:'secret'});
  await createPaymentIntent({paymentId:7,reservationId:9,amount:150,currency:'CHF',attemptKey:'revision-2'});
  expect(gateway.create).toHaveBeenCalledWith(expect.objectContaining({amount:15000,currency:'chf'}),{idempotencyKey:'drive-luxury-payment-7-revision-2'});
  const retained=JSON.parse(updatedProviderPayload(JSON.stringify({providerAttemptKey:'revision-2',retiredProviderReferences:['pi_old']}),{status:'requires_action'}));
  expect(retained).toMatchObject({providerAttemptKey:'revision-2',retiredProviderReferences:['pi_old']});
 });
});
