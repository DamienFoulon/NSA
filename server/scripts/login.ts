/**
 * Obtains a Nintendo Account session token for the secondary account.
 * Run once on your own computer: npm run build && npm run login
 */
import { createInterface } from 'node:readline/promises';
import { NintendoAccountSessionAuthorisationCoral } from 'nxapi/coral';

const authorisation = NintendoAccountSessionAuthorisationCoral.create();

console.log('1. Open this URL and sign in with the SECONDARY Nintendo account:\n');
console.log(authorisation.authorise_url + '\n');
console.log('2. On the "Linking an External Account" page, right-click "Select this person"');
console.log('   and copy the link. It starts with "npf71b963c1b7b6d119://auth".\n');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const link = (await rl.question('Paste the link: ')).trim();
rl.close();

const params = new URLSearchParams(new URL(link).hash.slice(1));
const { session_token } = await authorisation.getSessionToken(params);

console.log('\nSession token (store it in NSO_SESSION_TOKEN, never commit or share it):\n');
console.log(session_token);
