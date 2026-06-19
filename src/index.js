'use strict';

const slugify = require('slugify');
const { sentryEnabled } = require('../instrument.js');
const Sentry = require('@sentry/node');

const SLUG_CONTENT_TYPES = {
  'api::blog.blog': { field: 'slug', reference: 'title' },
  'api::plant.plant': { field: 'slug', reference: 'title' },
  'api::volunteer-day.volunteer-day': { field: 'slug', reference: 'title' },
  'api::instruction.instruction': { field: 'slug', reference: 'title' },
  'api::project.project': { field: 'slug', reference: 'title' },
};

module.exports = {
  register({ strapi }) {
    strapi.documents.use(async (context, next) => {
      const config = SLUG_CONTENT_TYPES[context.uid];
      if (config && ['create', 'update'].includes(context.action)) {
        const data = context.params?.data;
        if (data && data[config.reference] && !data[config.field]) {
          data[config.field] = slugify(data[config.reference], { lower: true, strict: true });
        }
      }
      return next();
    });
  },

  bootstrap({ strapi }) {
    if (sentryEnabled) {
      Sentry.setupKoaErrorHandler(strapi.server);
    }
  },
};
