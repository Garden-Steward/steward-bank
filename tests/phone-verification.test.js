// Unit tests for the email-link password setup flow. Strapi is mocked; no boot needed.
const controller = require('../src/api/auth/controllers/phone-verification');

const TOKEN = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const future = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

const makeCtx = (body) => {
  const ctx = { request: { body }, sent: null, error: null };
  ['badRequest', 'forbidden', 'notFound', 'internalServerError'].forEach((k) => {
    ctx[k] = jest.fn((msg) => { ctx.error = { k, msg }; });
  });
  ctx.send = jest.fn((b) => { ctx.sent = b; });
  return ctx;
};

let user;
let update;

beforeEach(() => {
  update = jest.fn().mockResolvedValue({});
  const userQuery = { findOne: jest.fn(async () => (user ? { ...user } : null)), update };
  const roleQuery = { findOne: jest.fn(async () => ({ id: 1, type: 'authenticated' })) };
  global.strapi = {
    db: { query: jest.fn((uid) => (uid.includes('.role') ? roleQuery : userQuery)) },
    log: { error: jest.fn(), debug: jest.fn() },
  };
});

afterEach(() => { delete global.strapi; });

const pw = { password: 'longenough1', confirmPassword: 'longenough1' };

describe('setPassword', () => {
  it('rejects a request with no token, even for a verified email', async () => {
    user = { id: 5, email_confirmed: true, email_verification_token: null, email_verification_expires: null };
    const ctx = makeCtx({ userId: 5, ...pw });
    await controller.setPassword(ctx);
    expect(ctx.error.k).toBe('badRequest');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a wrong token', async () => {
    user = { id: 5, email_confirmed: true, email_verification_token: TOKEN, email_verification_expires: future() };
    const ctx = makeCtx({ userId: 5, token: OTHER, ...pw });
    await controller.setPassword(ctx);
    expect(ctx.error.k).toBe('forbidden');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    user = { id: 5, email_confirmed: true, email_verification_token: TOKEN, email_verification_expires: past() };
    const ctx = makeCtx({ userId: 5, token: TOKEN, ...pw });
    await controller.setPassword(ctx);
    expect(ctx.error.k).toBe('forbidden');
    expect(update).not.toHaveBeenCalled();
  });

  it('gives the same answer for an unknown user as for a bad token', async () => {
    user = null;
    const ctx = makeCtx({ userId: 999, token: TOKEN, ...pw });
    await controller.setPassword(ctx);
    expect(ctx.error).toEqual({ k: 'forbidden', msg: 'Invalid or expired link. Please request a new one.' });
  });

  it('sets the password with a valid token and makes the token single-use', async () => {
    user = { id: 5, email_confirmed: true, email_verification_token: TOKEN, email_verification_expires: future(), role: null };
    const ctx = makeCtx({ userId: 5, token: TOKEN, ...pw });
    await controller.setPassword(ctx);
    expect(ctx.sent.success).toBe(true);
    const { data } = update.mock.calls[0][0];
    expect(data.password).toBe('longenough1');
    expect(data.email_verification_token).toBeNull();
    expect(data.email_verification_expires).toBeNull();
    expect(data.role).toBe(1);
  });

  it('does not overwrite an existing role', async () => {
    user = { id: 5, email_confirmed: true, email_verification_token: TOKEN, email_verification_expires: future(), role: { id: 9 } };
    const ctx = makeCtx({ userId: 5, token: TOKEN, ...pw });
    await controller.setPassword(ctx);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('role');
  });
});

describe('verifyEmail', () => {
  it('keeps the token and opens a short setup window on first verification', async () => {
    user = { id: 5, email_confirmed: false, email_verification_token: TOKEN, email_verification_expires: future() };
    const ctx = makeCtx({ userId: 5, token: TOKEN });
    await controller.verifyEmail(ctx);
    expect(ctx.sent.verified).toBe(true);
    const { data } = update.mock.calls[0][0];
    expect(data.email_confirmed).toBe(true);
    expect(data).not.toHaveProperty('email_verification_token');
    expect(new Date(data.email_verification_expires).getTime()).toBeGreaterThan(Date.now());
  });

  it('does not extend the window when called again', async () => {
    user = { id: 5, email_confirmed: true, email_verification_token: TOKEN, email_verification_expires: future() };
    const ctx = makeCtx({ userId: 5, token: TOKEN });
    await controller.verifyEmail(ctx);
    expect(ctx.sent.verified).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a wrong token', async () => {
    user = { id: 5, email_confirmed: false, email_verification_token: TOKEN, email_verification_expires: future() };
    const ctx = makeCtx({ userId: 5, token: OTHER });
    await controller.verifyEmail(ctx);
    expect(ctx.error.k).toBe('forbidden');
  });
});
