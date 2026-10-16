'use strict';

/**
 * Project alerts: people sign up (no account needed) to hear about new
 * projects in a city or a zip. When a pitch is approved and its undo window
 * closes, api::project.review calls `notifyForProject`, which works out the
 * project's city + zip from its coordinates and emails every matching
 * subscriber once.
 */

const crypto = require('crypto');
const { escapeHtml } = require('../../../utils/html');
const { reverseGeocode } = require('../../../utils/reverse-geocode');

const FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@steward.garden';
const SITE_URL = 'https://steward.garden';
const UID = 'api::project-alert.project-alert';
const USER_UID = 'plugin::users-permissions.user';

const ZIP_RE = /^\d{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CITY_LENGTH = 80;
const ACCOUNT_LINK_MS = 7 * 24 * 60 * 60 * 1000;

/** "  Oakland,  CA " → "oakland". The state is dropped; matching is on city name. */
function normalizeCity(value) {
  return String(value || '')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** "oakland" → "Oakland", "san leandro" → "San Leandro". */
function titleCase(value) {
  return String(value || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Turn the signup form's { zip } or { city } into what's stored.
 * @returns {{ scope, zip?, city?, label } | { error }}
 */
function parseTarget({ zip, city } = {}) {
  const z = String(zip ?? '').trim();
  if (z) {
    if (!ZIP_RE.test(z)) return { error: 'Enter a 5-digit zip code' };
    return { scope: 'zip', zip: z, label: z };
  }
  const raw = String(city ?? '').replace(/\s+/g, ' ').trim();
  const c = normalizeCity(raw);
  if (!c) return { error: 'Enter a zip code or a city' };
  if (raw.length > MAX_CITY_LENGTH) return { error: 'That city name is too long' };
  return { scope: 'city', city: c, label: titleCase(raw) };
}

const unsubscribeUrl = (sub) => `${SITE_URL}/alerts/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`;

function footer(sub) {
  return `<p style="color:#6b7280;font-size:12px">You're getting this because you asked for project alerts for ${escapeHtml(sub.display_label)} on Garden Steward.
<a href="${unsubscribeUrl(sub)}">Unsubscribe</a></p>`;
}

function welcomeEmail(sub, { accountUrl }) {
  const label = escapeHtml(sub.display_label);
  const where = sub.scope === 'zip' ? `zip code ${label}` : label;
  const account = accountUrl
    ? `<p><b>Want to join in, not just hear about it?</b> We've saved a spot for you. Create your free Garden Steward account in two steps:</p>
<ol>
  <li><a href="${accountUrl}">Click here to confirm your email</a> (this link works for 7 days).</li>
  <li>Choose a password, then sign in at <a href="${SITE_URL}/login">steward.garden/login</a> with ${escapeHtml(sub.email)}.</li>
</ol>
<p>With an account you can mark projects you're interested in, RSVP to work days, and pitch a project of your own.</p>`
    : `<p>You already have a Garden Steward account with this email. <a href="${SITE_URL}/login">Sign in</a> to say you're interested in a project or RSVP to work days.</p>`;

  return {
    subject: `You're signed up for new projects in ${sub.display_label}`,
    html: `<p>Hi there,</p>
<p>Thanks for signing up. When a new community project is approved in ${where}, we'll email you here.</p>
<p>See what's happening now: <a href="${SITE_URL}/projects">steward.garden/projects</a></p>
${account}
${footer(sub)}`,
  };
}

function projectUrl(project) {
  return project.garden?.slug && project.slug
    ? `${SITE_URL}/gardens/${project.garden.slug}/p/${project.slug}`
    : `${SITE_URL}/projects`;
}

function projectEmail(project, sub) {
  const title = escapeHtml(project.title);
  const garden = project.garden?.title ? ` at ${escapeHtml(project.garden.title)}` : '';
  return {
    subject: `New project in ${sub.display_label}: ${project.title}`,
    html: `<p>A new community project was just approved${garden}:</p>
<p><b>${title}</b></p>
<p>${escapeHtml(project.short_description || '')}</p>
<p><a href="${projectUrl(project)}">See the project and get involved</a></p>
${footer(sub)}`,
  };
}

/** Coordinates for a project: its own pin, else its garden's. */
function projectCoords(project) {
  const pick = (o) =>
    o && o.latitude != null && o.longitude != null && o.latitude !== '' && o.longitude !== ''
      ? { lat: Number(o.latitude), lng: Number(o.longitude) }
      : null;
  return pick(project) || pick(project.garden);
}

module.exports = ({ strapi }) => ({
  EMAIL_RE,
  parseTarget,
  normalizeCity,
  welcomeEmail,
  projectEmail,
  reverseGeocode,

  /**
   * Add (or re-activate) a signup. Sends the welcome email the first time an
   * address signs up for anything.
   * @returns {{ label } | { error }}
   */
  async subscribe({ email, zip, city, user }) {
    const address = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(address)) return { error: 'Enter a valid email address' };
    const target = parseTarget({ zip, city });
    if (target.error) return target;

    const query = strapi.db.query(UID);
    const where = { email: address, scope: target.scope };
    if (target.scope === 'zip') where.zip = target.zip;
    else where.city = target.city;

    const owner = user?.email?.toLowerCase() === address
      ? user
      : await strapi.db.query(USER_UID).findOne({ where: { email: address } });

    const previouslyWelcomed = await query.findOne({
      where: { email: address, welcomed_at: { $notNull: true } },
      select: ['id'],
    });

    let sub = await query.findOne({ where });
    if (sub) {
      sub = await query.update({
        where: { id: sub.id },
        data: {
          unsubscribed_at: null,
          display_label: target.label,
          ...(owner && !sub.user ? { user: owner.id } : {}),
        },
      });
    } else {
      sub = await query.create({
        data: {
          ...where,
          display_label: target.label,
          user: owner?.id ?? null,
          unsubscribe_token: crypto.randomUUID(),
        },
      });
    }

    if (!previouslyWelcomed) {
      const accountUrl = owner && owner.id === user?.id ? null : await this.accountLink(owner, address, sub);
      const message = welcomeEmail(sub, { accountUrl });
      try {
        await strapi.plugins['email'].services.email.send({
          to: address,
          from: FROM_ADDRESS,
          subject: message.subject,
          html: message.html,
        });
      } catch (err) {
        strapi.log.error(`[project alerts] welcome email to subscription ${sub.id} failed:`, err);
      }
      await query.update({ where: { id: sub.id }, data: { welcomed_at: new Date() } });
    }

    return { label: target.label };
  },

  /**
   * A "create your account" link for the welcome email, or null when the
   * address already has a usable account. People without one get a soft user
   * record (as api::project.project.expressInterest does) and the same
   * verify-email → set-password link the phone sign-up sends, valid 7 days.
   */
  async accountLink(owner, address, sub) {
    const users = strapi.db.query(USER_UID);
    let account = owner;
    if (account?.email_confirmed) return null;
    if (!account) {
      const userService = strapi.plugins['users-permissions']?.services?.user;
      if (!userService) return null;
      account = await userService.add({
        email: address,
        username: address,
        // Unusable until they set their own via the link below.
        password: crypto.randomBytes(24).toString('hex'),
        confirmed: true,
        firstName: address.split('@')[0] || 'Neighbor',
      });
    }
    if (!sub.user) {
      await strapi.db.query(UID).update({ where: { id: sub.id }, data: { user: account.id } });
    }
    const token = crypto.randomBytes(32).toString('hex');
    await users.update({
      where: { id: account.id },
      data: {
        email_verification_token: token,
        email_verification_expires: new Date(Date.now() + ACCOUNT_LINK_MS).toISOString(),
      },
    });
    return `${SITE_URL}/verify-email?token=${token}&userId=${account.id}`;
  },

  /** @returns the subscription's label, or null if the token is unknown. */
  async unsubscribe(token) {
    if (!token) return null;
    const sub = await strapi.db.query(UID).findOne({ where: { unsubscribe_token: String(token) } });
    if (!sub) return null;
    if (!sub.unsubscribed_at) {
      await strapi.db.query(UID).update({ where: { id: sub.id }, data: { unsubscribed_at: new Date() } });
    }
    return { label: sub.display_label };
  },

  /**
   * Email everyone subscribed to this approved project's city or zip. Runs at
   * most once per project (`subscribers_notified_at`). Expects `garden` populated.
   * @returns number of emails sent
   */
  async notifyForProject(project) {
    if (!project?.id || project.subscribers_notified_at) return 0;

    let city = project.location_city || null;
    let zip = project.location_zip || null;
    if (!city && !zip) {
      const coords = projectCoords(project);
      const place = coords ? await this.reverseGeocode(coords.lat, coords.lng) : null;
      city = place?.city || null;
      zip = place?.zip || null;
    }

    // Mark first: a crash mid-send must not email the same people twice.
    await strapi.db.query('api::project.project').update({
      where: { id: project.id },
      data: { location_city: city, location_zip: zip, subscribers_notified_at: new Date() },
    });

    const matches = [];
    if (zip) matches.push({ scope: 'zip', zip });
    if (city) matches.push({ scope: 'city', city: normalizeCity(city) });
    if (!matches.length) return 0;

    const subs = await strapi.db.query(UID).findMany({
      where: { unsubscribed_at: { $null: true }, $or: matches },
      orderBy: { id: 'asc' },
    });

    // One email per address; a zip match is the more specific label, so it wins.
    const byEmail = new Map();
    for (const sub of subs) {
      const existing = byEmail.get(sub.email);
      if (!existing || (existing.scope === 'city' && sub.scope === 'zip')) byEmail.set(sub.email, sub);
    }
    // The pitcher already got "your project is live".
    const pitcher = (project.created_by?.email || project.submitter_email || '').toLowerCase();
    byEmail.delete(pitcher);

    let sent = 0;
    for (const sub of byEmail.values()) {
      const message = projectEmail(project, sub);
      try {
        await strapi.plugins['email'].services.email.send({
          to: sub.email,
          from: FROM_ADDRESS,
          subject: message.subject,
          html: message.html,
        });
        sent++;
      } catch (err) {
        strapi.log.error(`[project alerts] email for project ${project.id} to subscription ${sub.id} failed:`, err);
      }
    }
    return sent;
  },
});
