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
    const noconfirmedEvent = eventMock.event;
    noconfirmedEvent.confirmed = [];    
    await strapi.db.query('api::volunteer-day.volunteer-day').create({data: noconfirmedEvent});

    eventHelper.rsvpEvent("34", {userId: 1}).then(res=>{
      const {data} = res;
      expect(data.attributes.confirmed.data.some(user => user.id === 1)).toBe(true);
    });
  });
});

