/**
 * Test-scoped monkey-patching with automatic restore.
 *
 * Every behavioural test module is `require`d into the single app.test.js suite,
 * and Strapi hands back the *same* service / repository object on every lookup.
 * A patch left in place therefore leaks into every suite that runs after it —
 * which is how a stubbed `getUserTasksByStatus` in one file silently rewrote the
 * results of an unrelated file further down app.test.js.
 *
 * Patch through these helpers and the global afterEach in app.test.js puts the
 * originals back after each test.
 */

const applied = [];

/**
 * Replace `target[method]` for the duration of the current test.
 * @returns the implementation, so callers can keep asserting on the jest.fn().
 */
const patch = (target, method, impl) => {
  applied.push({
    target,
    method,
    original: target[method],
    owned: Object.prototype.hasOwnProperty.call(target, method),
  });
  target[method] = impl;
  return impl;
};

/** Patch a method on a Strapi service, e.g. patchService('api::sms.sms', 'handleSms', fn). */
const patchService = (uid, method, impl) => patch(strapi.service(uid), method, impl);

/** Patch a method on a Strapi query repository (these are cached per UID). */
const patchQuery = (uid, method, impl) => patch(strapi.db.query(uid), method, impl);

/** Undo every patch, most recent first. Registered as a global afterEach. */
const restoreAll = () => {
  while (applied.length) {
    const { target, method, original, owned } = applied.pop();
    if (owned) {
      target[method] = original;
    } else {
      delete target[method];
    }
  }
};

module.exports = { patch, patchService, patchQuery, restoreAll };
