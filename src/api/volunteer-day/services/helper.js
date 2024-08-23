const utils = require("@strapi/utils");

const eventHelper = {};

eventHelper.inviteUserEvent = async (eventId, data) => {
  const event = await strapi.db.query("api::volunteer-day.volunteer-day")
  .findOne({
    where:{id: ctx.params.id},
    populate: ["garden"]
  });
  let body = `Hello! Do you have interest in participating in ${event.title}? To start, reply with ${event.garden.sms_slug}. We'll walk you through a quick registration.`
  await strapi.service('api::sms.sms').handleSms({
    meta_data: {phoneNumber: data.phoneNumber}, 
    body,
    type: 'registration',
    event: event
  });
  return {success: true, body: body}
}

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
