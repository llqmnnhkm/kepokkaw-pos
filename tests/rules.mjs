// Security rules tests on the real Firestore emulator.
// Run with: npm run test:rules   (needs Java; GitHub Actions runs it on every pull request)
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-kepokkaw',
  firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log('PASS ' + name) }
  catch (e) {
    failures++;
    console.log('FAIL ' + name + '\n     ' + String(e && e.message || e).split('\n')[0]);
    if (process.env.GITHUB_ACTIONS) console.log('::error::Rules test failed: ' + name);
  }
}
const db = uid => env.authenticatedContext(uid).firestore();
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
const WEEK = 'weeks/2026-10-05', LOG = 'log/2026-10';
const now = () => Date.now();
const order = (id, extra) => Object.assign({
  id, no: 5, ts: now(), date: '2026-10-11', by: 'staff', voided: null, name: 'Aina', uid: 'aina',
  lines: [{ itemId: 'chz', name: 'Cheese', price: 11, qty: 1 }], total: 11, pay: 'cash', at: serverTimestamp(),
}, extra);
// write one order the way the app does: the order plus "last" naming it
const putOrder = (d, id, value) => setDoc(doc(d, WEEK), { last: id, o: { [id]: value } }, { mergeFields: ['last', 'o.' + id] });
const editOrder = (d, id, field, value) => setDoc(doc(d, WEEK), { last: id, o: { [id]: { [field]: value } } }, { mergeFields: ['last', `o.${id}.${field}`] });
const entry = (id, extra) => Object.assign({ id, ts: now(), by: 'staff', name: 'Aina', uid: 'aina', action: 'Voided order', detail: '#5', at: serverTimestamp() }, extra);
const putLog = (d, id, value) => setDoc(doc(d, LOG), { last: id, l: { [id]: value } }, { mergeFields: ['last', 'l.' + id] });

/* ---------- shop set up: the first account claims the shop, nobody after ---------- */
await check('first account can set up the shop', async () => {
  const b = writeBatch(db('owner'));
  b.set(doc(db('owner'), 'meta/owner'), { uid: 'owner', ts: now() });
  b.set(doc(db('owner'), 'users/owner'), { role: 'admin', owner: true, name: 'Owner', email: 'o@x.my', ts: now() });
  await assertSucceeds(b.commit());
});
await check('a second account cannot claim the shop', async () => {
  const b = writeBatch(db('eve'));
  b.set(doc(db('eve'), 'users/eve'), { role: 'admin', owner: true, name: 'Eve', email: 'e@x.my', ts: now() });
  await assertFails(b.commit());
});

await seed(async s => {
  await setDoc(doc(s, 'users/aina'), { role: 'staff', name: 'Aina', email: 'aina@x.my' });
  await setDoc(doc(s, 'users/gone'), { role: 'removed', name: 'Gone', email: 'gone@x.my' });
  await setDoc(doc(s, WEEK), { o: { legacy: Object.assign(order('legacy'), { at: null }) } });
  await setDoc(doc(s, LOG), { l: { old1: { id: 'old1', ts: now(), by: 'admin', name: 'Owner', uid: 'owner', action: 'Added item', detail: '', at: Timestamp.now() } } });
  await setDoc(doc(s, 'exp/2026-10'), { e: {} });
});

/* ---------- team ---------- */
await check('admin can add a staff member', () => assertSucceeds(setDoc(doc(db('owner'), 'users/sam'), { role: 'staff', name: 'Sam', email: 's@x.my' })));
await check('staff cannot make themselves admin', () => assertFails(setDoc(doc(db('aina'), 'users/aina'), { role: 'admin' }, { merge: true })));
await check('nobody can demote the owner', () => assertFails(setDoc(doc(db('sam'), 'users/owner'), { role: 'staff' }, { merge: true })));

/* ---------- staff orders ---------- */
await check('staff can add an order signed by them', () => assertSucceeds(putOrder(db('aina'), 'n1', order('n1'))));
await check('staff cannot add an order under another account', () => assertFails(putOrder(db('aina'), 'n2', order('n2', { uid: 'owner' }))));
await check('staff cannot add an order marked as admin', () => assertFails(putOrder(db('aina'), 'n3', order('n3', { by: 'admin' }))));
await check('staff cannot add an order under another name', () => assertFails(putOrder(db('aina'), 'n4', order('n4', { name: 'Owner' }))));
await check('staff cannot set their own upload time', () => assertFails(putOrder(db('aina'), 'n5', order('n5', { at: Timestamp.fromMillis(now() - 3600e3) }))));
await check('staff cannot add an order that is already voided', () => assertFails(putOrder(db('aina'), 'n6', order('n6', { voided: { ts: now(), reason: 'x', by: 'staff', name: 'Aina', uid: 'aina' } }))));
await check('staff cannot add two orders in one write', () => assertFails(setDoc(doc(db('aina'), WEEK),
  { last: 'n7', o: { n7: order('n7'), n8: order('n8') } }, { mergeFields: ['last', 'o.n7', 'o.n8'] })));
await check('staff cannot write an order without naming it', () => assertFails(setDoc(doc(db('aina'), WEEK), { o: { n9: order('n9') } }, { mergeFields: ['o.n9'] })));
await check('staff cannot change the total of an order', () => assertFails(editOrder(db('aina'), 'n1', 'total', 1)));
await check('staff cannot change the items of an order', () => assertFails(editOrder(db('aina'), 'n1', 'lines', [])));
await check('staff can switch Cash or Online on tonight\'s order', () => assertSucceeds(editOrder(db('aina'), 'n1', 'pay', 'online')));
await check('staff can edit the remark on tonight\'s order', () => assertSucceeds(editOrder(db('aina'), 'n1', 'note', 'No sauce')));
await check('staff can void an order right after making it', () => assertSucceeds(editOrder(db('aina'), 'n1', 'voided', { ts: now(), reason: 'Wrong flavour keyed in', by: 'staff', name: 'Aina', uid: 'aina' })));
await check('staff cannot undo a void', () => assertFails(editOrder(db('aina'), 'n1', 'voided', null)));
await check('staff cannot touch an order made before this update', () => assertFails(editOrder(db('aina'), 'legacy', 'pay', 'online')));
await check('staff cannot delete an order', () => assertFails(setDoc(doc(db('aina'), WEEK), { last: 'n1', o: { n1: deleteField() } }, { mergeFields: ['last', 'o.n1'] })));
await check('removed staff cannot add orders', () => assertFails(putOrder(db('gone'), 'g1', order('g1', { uid: 'gone', name: 'Gone' }))));
await check('removed staff cannot read orders', () => assertFails(getDoc(doc(db('gone'), WEEK))));

/* ---------- admin orders ---------- */
await check('admin can correct an order total', () => assertSucceeds(setDoc(doc(db('owner'), WEEK), { o: { n1: { total: 10 } } }, { mergeFields: ['o.n1.total'] })));
await check('admin can delete an order', () => assertSucceeds(setDoc(doc(db('owner'), WEEK), { o: { legacy: deleteField() } }, { mergeFields: ['o.legacy'] })));

/* ---------- activity log ---------- */
await check('staff can add a log entry signed by them', () => assertSucceeds(putLog(db('aina'), 'a1', entry('a1'))));
await check('staff cannot add a log entry under another name', () => assertFails(putLog(db('aina'), 'a2', entry('a2', { name: 'Owner' }))));
await check('staff cannot add a log entry under another account', () => assertFails(putLog(db('aina'), 'a3', entry('a3', { uid: 'owner' }))));
await check('staff cannot add a log entry marked as admin', () => assertFails(putLog(db('aina'), 'a4', entry('a4', { by: 'admin' }))));
await check('a log entry cannot set its own time', () => assertFails(putLog(db('aina'), 'a5', entry('a5', { at: Timestamp.fromMillis(now() - 86400e3) }))));
await check('admin can add a log entry signed by them', () => assertSucceeds(putLog(db('owner'), 'b1', entry('b1', { by: 'admin', name: 'Owner', uid: 'owner' }))));
await check('admin cannot change a log entry', () => assertFails(setDoc(doc(db('owner'), LOG), { last: 'old1', l: { old1: { detail: 'edited' } } }, { mergeFields: ['last', 'l.old1.detail'] })));
await check('admin cannot erase a log entry', () => assertFails(setDoc(doc(db('owner'), LOG), { last: 'old1', l: { old1: deleteField() } }, { mergeFields: ['last', 'l.old1'] })));
await check('admin cannot delete the log', () => assertFails(deleteDoc(doc(db('owner'), LOG))));
await check('two log entries in one write are refused', () => assertFails(setDoc(doc(db('owner'), LOG),
  { last: 'b2', l: { b2: entry('b2', { by: 'admin', name: 'Owner', uid: 'owner' }), b3: entry('b3', { by: 'admin', name: 'Owner', uid: 'owner' }) } }, { mergeFields: ['last', 'l.b2', 'l.b3'] })));
await check('staff cannot read the log', () => assertFails(getDoc(doc(db('aina'), LOG))));
await check('admin can read the log', () => assertSucceeds(getDoc(doc(db('owner'), LOG))));

/* ---------- money and settings ---------- */
await check('staff cannot read expenses', () => assertFails(getDoc(doc(db('aina'), 'exp/2026-10'))));
await check('staff cannot change the menu', () => assertFails(setDoc(doc(db('aina'), 'meta/shop'), { items: [], target: 0, lowAt: 5 })));
await check('signed out visitors cannot read orders', () => assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), WEEK))));

await env.cleanup();
console.log(failures ? `\n${failures} FAILED` : '\nALL RULES TESTS PASSED');
process.exit(failures ? 1 : 0);
