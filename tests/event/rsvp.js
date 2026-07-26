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

    // v5 returns a flat entity — the v4 `attributes` / nested `data` wrappers are gone.
    const { data } = await eventHelper.rsvpEvent(newEvent.id, {userId: 1, user: {phoneNumber: "1234567890"}});
    expect(data.confirmed.some(user => user.id === 1)).toBe(true);
  });
});