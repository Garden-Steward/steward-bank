const utils = require("@strapi/utils");

const eventHelper = {};


eventHelper.rsvpEvent = async (eventId, data) => {
  let event = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
    populate: ['confirmed'],
    where: {
      id: eventId
    }
  });

  event.confirmed.push(data.userId);
  let updatedEvent = await strapi.db.query("api::volunteer-day.volunteer-day").update({
    where: {id: eventId},
    data: {
      confirmed: event.confirmed
    },
    populate: ['confirmed']
  });
  const schema = strapi.getModel('api::volunteer-day.volunteer-day');
  updatedEvent.confirmed = {data: updatedEvent.confirmed}
  let eventSanitized = await utils.sanitize.contentAPI.output({data: {attributes: updatedEvent}}, schema);

  return eventSanitized;
}
module.exports = eventHelper;
