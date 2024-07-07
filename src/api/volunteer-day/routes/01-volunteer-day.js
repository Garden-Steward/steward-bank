
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
      method: 'POST',
      path: '/volunteer-days/rsvp/:id',
      handler: 'volunteer-day.rsvpEvent',
    },

  ]
}