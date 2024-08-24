const eventHelper = require('../../src/api/volunteer-day/services/helper');

describe('getRSVPs', function() {
  // it('should create a create a weekly schedule', function() {
  //   const schedulersMock = require('./schedulersMock.js');
  //   weeklyScheduleHelper.createWeeklySchedule({id:1, ...schedulersMock}).then(res=>{
  //     console.log("schedule: ", res);
  //   });
  // });
  it('should RSVP the user to confirmed', async function() {

    const eventMock = require('./eventMock.js');
    eventMock.garden = {id: 1, title: "Test Garden", sms_slug: "test-garden"};
    const noconfirmedEvent = eventMock.event;
    noconfirmedEvent.confirmed = [];    
    await strapi.db.query('api::volunteer-day.volunteer-day').create({data: noconfirmedEvent});

    eventHelper.rsvpEvent("34", {userId: 1, user: {phoneNumber: "1234567890"}}).then(res=>{
      const {data} = res;
      expect(data.attributes.confirmed.data.some(user => user.id === 1)).toBe(true);
    });
  });
  
  it('should invite user to join the garden', async function() {
    const eventMock = require('./eventMock.js');
    
    // Create the garden first
    const garden = await strapi.db.query('api::garden.garden').create({
      data: {title: "Test Garden", sms_slug: "test-garden" }
    });

    eventMock.event.id = 404; // Use a number instead of a string
    const noconfirmedEvent = { ...eventMock.event, confirmed: [] };
    
    // Create the volunteer day
    const createdEvent = await strapi.db.query('api::volunteer-day.volunteer-day').create({
      data: noconfirmedEvent
    });
    createdEvent.garden = garden;

    await eventHelper.inviteUserEvent({phoneNumber: "1234567890", event: createdEvent}).then(res => {
      const {body} = res;
      expect(body).toBe("Hello! Do you have interest in participating at Test Event? To start, reply with test-garden. We'll walk you through a quick registration.");
    });
  });
});