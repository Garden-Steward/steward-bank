'use strict';

// The Public role can't read users, so the REST sanitizer drops populated user
// relations for signed-out callers. Public pages still count volunteers and
// interested people, so these put the requested relations back as id-only
// lists, read straight from the DB. Only ids: never user records.

// Which of `relations` a REST query asked to populate.
function requestedRelations(populate, relations) {
  if (!populate) return [];
  if (populate === '*') return relations;
  const keys = typeof populate === 'string'
    ? populate.split(',').map((s) => s.trim().split('.')[0])
    : Array.isArray(populate)
      ? populate.map((s) => String(s).split('.')[0])
      : Object.keys(populate);
  return relations.filter((r) => keys.includes(r));
}

// Set each requested relation in `relations` on every entity to [{ id }].
async function attachUserIds(strapi, uid, populate, entities, relations) {
  const wanted = requestedRelations(populate, relations);
  const ids = entities.map((e) => e?.id).filter((id) => id != null);
  if (!wanted.length || !ids.length) return entities;

  const rows = await strapi.db.query(uid).findMany({
    where: { id: { $in: ids } },
    select: ['id'],
    populate: Object.fromEntries(wanted.map((r) => [r, { select: ['id'] }])),
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return entities.map((e) => {
    const row = e && byId.get(e.id);
    if (!row) return e;
    const out = { ...e };
    for (const r of wanted) out[r] = (row[r] || []).map((u) => ({ id: u.id }));
    return out;
  });
}

// For a core find/findOne response: patch `data` in place when signed out.
async function withPublicUserIds(strapi, uid, ctx, response, relations) {
  if (ctx.state.user || !response?.data) return response;
  const list = Array.isArray(response.data);
  const patched = await attachUserIds(strapi, uid, ctx.query.populate, list ? response.data : [response.data], relations);
  response.data = list ? patched : patched[0];
  return response;
}

module.exports = { attachUserIds, withPublicUserIds };
