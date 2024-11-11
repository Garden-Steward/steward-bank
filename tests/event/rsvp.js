const eventHelper = require('../../src/api/volunteer-day/services/helper');

describe('getRSVPs', function() {
  it('should RSVP the user to confirmed', async function() {
    const eventMock = require('./eventMock.js');
    
    // Create the garden first
    const garden = await strapi.db.query('api::garden.garden').create({
      data: {title: "Test Garden", sms_slug: "test-garden" }
    });

    // Remove id and prepare event data
    const { id, ...eventData } = eventMock.event;
    const noconfirmedEvent = { 
      ...eventData, 
      confirmed: [],
      garden: garden.id  // Link to the newly created garden
    };    
    
    let newEvent = await strapi.db.query('api::volunteer-day.volunteer-day').create({
      data: noconfirmedEvent
    });

    eventHelper.rsvpEvent(newEvent.id, {userId: 1, user: {phoneNumber: "1234567890"}}).then(res=>{
      const {data} = res;
      expect(data.attributes.confirmed.data.some(user => user.id === 1)).toBe(true);
    });
  });
});