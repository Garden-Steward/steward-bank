const utils = require("@strapi/utils");

const eventHelper = {};

/**
 * Invites an unknown user to join a garden and then RSVPs them to an event
 * @param {*} eventId 
 * @param {*} data 
 * @returns 
 */
eventHelper.inviteUserEvent = async (data) => {
  let body = `Hello! Do you have interest in participating at ${data.event.title}? To start, reply with ${data.event.garden.sms_slug.toUpperCase()}. We'll walk you through a quick registration.`
  await strapi.service('api::sms.sms').handleSms({
    user: {phoneNumber: data.phoneNumber},
    meta_data: {phoneNumber: data.phoneNumber, eventId: data.event.id}, 
    body,
    type: 'registration',
    event: data.event
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
  if (!event) {
    throw new Error("Event not found");
  }

  event.confirmed.push(data.userId);
  let updatedEvent = await strapi.db.query("api::volunteer-day.volunteer-day").update({
    where: {id: eventId},
    data: {
      confirmed: event.confirmed
    },
    populate: ['confirmed']
  });

  await strapi.service('api::sms.sms').handleSms({
    meta_data: {phoneNumber: data.user.phoneNumber, rsvpClicked: true}, 
    body: `You've RSVP'd to ${event.title}!`,
    type: 'reply',
    event: event
  });
  
  const schema = strapi.getModel('api::volunteer-day.volunteer-day');
  updatedEvent.confirmed = {data: updatedEvent.confirmed}
  let eventSanitized = await utils.sanitize.contentAPI.output({data: {attributes: updatedEvent}}, schema);

  return eventSanitized;
}
module.exports = eventHelper;
