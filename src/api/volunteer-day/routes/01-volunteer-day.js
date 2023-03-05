
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
    }
  ]
}