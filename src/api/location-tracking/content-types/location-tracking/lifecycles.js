'use strict';

const Geo = require('../../../../../config/helpers/geo');

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    if (
      data.garden_assignment_status === 'confirmed' ||
      data.garden_assignment_status === 'declined'
    ) {
      return;
    }

    const gardens = await strapi.service('api::garden.garden').getCachedGardens();
    Geo.applyGardenSuggestion(data, gardens);
  },
};
