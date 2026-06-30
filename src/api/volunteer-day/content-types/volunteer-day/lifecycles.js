'use strict';

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    // Check for duplicate volunteer day with same startDatetime and garden
    if (data.startDatetime) {
      const duplicateFilters = {
        startDatetime: data.startDatetime,
      };

      // The garden relation arrives in several shapes depending on the code path:
      //   - scalar id (e.g. data.garden = 5)
      //   - { id }              (already-loaded relation)
      //   - { connect: [{ id }] } (admin create/update)
      //   - { set: [{ id }] }     (Strapi v5 publish clones the relation this way)
      let gardenId = null;
      if (data.garden) {
        if (typeof data.garden === 'object') {
          gardenId =
            data.garden.id ||
            data.garden.connect?.[0]?.id ||
            data.garden.set?.[0]?.id;
        } else {
          gardenId = data.garden;
        }
      }

      if (gardenId) {
        duplicateFilters.garden = {
          id: gardenId
        };
      }

      // In Strapi v5 draft & publish, draft and published versions are stored as
      // separate rows sharing the same documentId. Editing/publishing an existing
      // entry triggers a `createEntry` (and thus beforeCreate) for the other
      // version, which would otherwise collide with itself here. Exclude any row
      // belonging to the same document so an edit isn't flagged as a duplicate.
      if (data.documentId) {
        duplicateFilters.documentId = { $ne: data.documentId };
      }

      const existingEvent = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
        where: duplicateFilters,
        populate: ['garden'],
      });

      if (existingEvent) {
        const existingGardenId = existingEvent.garden?.id ?? existingEvent.garden;
        const gardensMatch = !gardenId || existingGardenId === gardenId;

        const sameDocument =
          data.documentId &&
          existingEvent.documentId &&
          data.documentId === existingEvent.documentId;

        // Strapi v5 discard-drafts migration clones published rows as drafts via
        // beforeCreate without documentId on data — skip self-collision.
        const draftCloneOfPublished =
          gardensMatch &&
          data.publishedAt == null &&
          existingEvent.publishedAt != null &&
          existingEvent.startDatetime === data.startDatetime;

        if (!sameDocument && !draftCloneOfPublished) {
          throw new Error('A volunteer day with the same start date/time already exists' +
            (gardenId ? ' for this garden' : '') + '.');
        }
      }
    }

    // Auto-extract album ID from URL if provided
    if (data.photo_album_url && !data.photo_album_id) {
      const volunteerDayService = strapi.service('api::volunteer-day.volunteer-day');
      data.photo_album_id = await volunteerDayService.extractAlbumId(data.photo_album_url);
    }
  },

  async beforeUpdate(event) {
    const { data } = event.params;

    // Auto-extract album ID from URL if changed
    if (data.photo_album_url) {
      const volunteerDayService = strapi.service('api::volunteer-day.volunteer-day');
      data.photo_album_id = await volunteerDayService.extractAlbumId(data.photo_album_url);
    }
  }
};
