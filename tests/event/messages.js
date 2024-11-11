const vdayHelper = require('../../src/api/volunteer-day/controllers/VdayHelper');


describe('Send correct copy', function() {
  it('should build the copy for an upcoming day', async function() {
    const eventMock = require('./eventMock.js');
    const copy = vdayHelper.buildUpcomingDayCopy(eventMock.event);
    expect(copy).toBe("Test Garden has an upcoming event! All welcome at \"Test Event\". Let's take advantage of the moisture and weed and plant the garden! Jul 22, 9:30am to around noon.");
  });

  it('should build the copy for tomorrow', async function() {
    const eventMock = require('./eventMock.js');
    const copy = vdayHelper.buildTomorrowCopy(eventMock.event);
    expect(copy).toBe("Tomorrow!! Test Garden has event! All welcome at \"Test Event\". Let's take advantage of the moisture and weed and plant the garden! Come by from 9:30am to around noon.");
  });

  it ('should add the smsLink to the event', async function() {
    const eventMock = require('./eventMock.js');
    eventMock.event.smsLink = true;
    const copy = vdayHelper.buildUpcomingDayCopy(eventMock.event); 
    expect(copy).toContain("https://steward.garden/d/");
  });
});

describe('sendGroupMsg', function() {
  it('should send a message to all confirmed volunteers', async function() {
    const eventMock = require('./eventMock.js');
    // eventMock.garden = {id: 1, title: "Test Garden", sms_slug: "test-garden"};
    
    const { id, ...eventData } = eventMock.event;
    const noconfirmedEvent = { ...eventData, confirmed: [], smsLink: true };    
    
    let newEvent = await strapi.db.query('api::volunteer-day.volunteer-day').create({
      data: noconfirmedEvent
    });
    newEvent.garden = {id: 1, title: "Test Garden", sms_slug: "test-garden"};

    strapi.service('api::volunteer-day.volunteer-day').getVolunteerGroup = jest.fn().mockResolvedValue([{
      phoneNumber: '+13038833330',
      firstName: 'John',
      lastName: 'Doe'
    }]);

    const copy = vdayHelper.buildUpcomingDayCopy(newEvent); 

    strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(newEvent.id, copy).then(res => {
      expect(res.length).toBe(1);
    });
  });
});

