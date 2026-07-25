
module.exports = {
  routes: [
    { // Path defined with an URL parameter
      method: 'GET',
      path: '/volunteer-days/sms/:id', 
      handler: 'volunteer-day.testSms',
    },
    { // Path defined with an URL parameter
      method: 'POST',
      path: '/volunteer-days/sms/:id', 
      handler: 'volunteer-day.groupSms',
    },
    { // Path defined with an URL parameter
      method: 'GET',
      path: '/volunteer-days/user', 
      handler: 'volunteer-day.getByUser',
    },
    { // Path defined with an URL parameter
      method: 'GET',
      path: '/volunteer-days/garden/:slug', 
      handler: 'volunteer-day.getByGarden',
    },
    {
      method: 'GET',
      path: '/volunteer-days/public',
      handler: 'volunteer-day.getPublic',
    },
    { // Fetch a single event by NUMERIC id (v5 core findOne is documentId-only;
      // numeric /d/:id URLs are baked into SMS links, so we keep them working here).
      method: 'GET',
      path: '/volunteer-days/by-id/:id',
      handler: 'volunteer-day.getById',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/volunteer-days/rsvp/:id',
      handler: 'volunteer-day.rsvpEvent',
    },

  ]
}