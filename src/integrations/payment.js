import { v4 as uuid } from 'uuid';
class MockPaymentProvider {
    async create(_input) {
        const id = `mock_${uuid()}`;
        return { provider: 'mock', providerPaymentId: id, status: 'REQUIRES_CONFIRMATION', clientSecret: id };
    }
    async confirm(providerPaymentId) {
        return { provider: 'mock', providerPaymentId, status: 'CAPTURED' };
    }
}
export const paymentProvider = new MockPaymentProvider();
