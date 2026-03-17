import { PLATFORM_SESSION_CONFIGS, buildBridgeMessage, ALLOWED_SESSION_STATES } from '../contracts.js';

console.log('Respondio mobile app shell contract');
console.log('');
console.log('Platforms:', Object.keys(PLATFORM_SESSION_CONFIGS));
console.log('Allowed session states:', ALLOWED_SESSION_STATES.join(', '));
console.log('');
console.log('Example bridge payload:');
console.log(JSON.stringify(buildBridgeMessage('yogiyo', 'demo-store-id'), null, 2));
