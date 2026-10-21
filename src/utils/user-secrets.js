'use strict';

// db.query skips the REST sanitizer, so users it populates arrive with every
// column: password hash, reset/confirmation tokens, login codes. Run any raw
// db.query result that can carry users through this before it goes out.

const USER_UID = 'plugin::users-permissions.user';

let secretFields;
function getSecretFields(strapi) {
  if (!secretFields) {
    const attributes = strapi.getModel(USER_UID)?.attributes || {};
    secretFields = new Set([
      'password', 'resetPasswordToken', 'confirmationToken',
      ...Object.entries(attributes).filter(([, a]) => a.private).map(([k]) => k),
    ]);
  }
  return secretFields;
}

// Drops every private user attribute, at any depth. Mutates and returns `value`.
function stripUserSecrets(strapi, value) {
  const fields = getSecretFields(strapi);
  const seen = new Set();
  const walk = (v) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) return v.forEach(walk);
    for (const f of fields) delete v[f];
    Object.values(v).forEach(walk);
  };
  walk(value);
  return value;
}

// Drops email and phoneNumber from every user (anything with a username)
// except `keepId`, at any depth. Mutates and returns `value`.
const CONTACT_FIELDS = ['email', 'phoneNumber'];
function stripOtherUsersContact(value, keepId) {
  const seen = new Set();
  const walk = (v) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) return v.forEach(walk);
    if ('username' in v && v.id !== keepId) {
      for (const f of CONTACT_FIELDS) delete v[f];
    }
    Object.values(v).forEach(walk);
  };
  walk(value);
  return value;
}

module.exports = { stripUserSecrets, stripOtherUsersContact };
