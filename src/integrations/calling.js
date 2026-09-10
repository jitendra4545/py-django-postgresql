import { v4 as uuid } from 'uuid';
class MockMaskedCallingProvider {
    async createSession() {
        return { provider: 'mock', providerSessionId: `call_${uuid()}`, maskedNumber: '+0000000000', status: 'CREATED' };
    }
}
export const maskedCallingProvider = new MockMaskedCallingProvider();
