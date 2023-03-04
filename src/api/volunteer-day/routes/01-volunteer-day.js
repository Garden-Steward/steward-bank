
module.exports = {
  routes: [
    { // Path defined with an URL parameter
      method: 'POST',
      path: '/volunteer/sms/:id', 
      handler: 'volunteer-day.groupSms',
    }
  ]
}