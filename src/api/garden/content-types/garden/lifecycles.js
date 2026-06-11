/**
 * Garden lifecycle hooks
 * Refreshes the garden cache when gardens are created/updated
 */

const { errors } = require('@strapi/utils');
const Geo = require('../../../../../config/helpers/geo');
const { WELCOME_EMAIL } = require('../../../email/defaultTemplates');

function assertValidBoundary(data) {
  if (data.boundary === undefined) {
    return;
  }
  const result = Geo.validateBoundary(data.boundary);
  if (!result.valid) {
    throw new errors.ApplicationError(`Invalid garden boundary: ${result.error}`);
  }
}

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    assertValidBoundary(data);
    // Seed default welcome email template if not already set
    if (!data.welcome_email_subject) {
      data.welcome_email_subject = WELCOME_EMAIL.subject;
    }
    if (!data.welcome_email_body) {
      data.welcome_email_body = WELCOME_EMAIL.body;
    }
  },

  async beforeUpdate(event) {
    const { data } = event.params;
    assertValidBoundary(data);
  },

  async afterCreate(event) {
    const { result } = event;
    console.log(`✅ Garden created: ${result.title} (${result.sms_slug})`);
    try {
      await strapi.service('api::garden.garden').ensureTemporaryInterestForNewGarden(result.id);
    } catch (err) {
      console.error('⚠️  Failed to attach Temporary interest after create:', err.message);
    }
    // Refresh cache
    try {
      await strapi.service('api::garden.garden').refreshCache();
      console.log(`🔄 Garden cache refreshed after create`);
    } catch (err) {
      console.error('⚠️  Failed to refresh cache after create:', err.message);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    console.log(`✅ Garden updated: ${result.title} (${result.sms_slug})`);
    // Refresh cache
    try {
      await strapi.service('api::garden.garden').refreshCache();
      console.log(`🔄 Garden cache refreshed after update`);
    } catch (err) {
      console.error('⚠️  Failed to refresh cache after update:', err.message);
    }
  },

  async afterDelete(event) {
    const { result } = event;
    console.log(`❌ Garden deleted: ${result.title}`);
    // Refresh cache
    try {
      await strapi.service('api::garden.garden').refreshCache();
      console.log(`🔄 Garden cache refreshed after delete`);
    } catch (err) {
      console.error('⚠️  Failed to refresh cache after delete:', err.message);
    }
  }
};
