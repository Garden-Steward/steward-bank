
module.exports = {
  routes: [
    { // Path defined with an URL parameter
      method: 'POST',
      path: '/sms-campaigns/sms/test', 
      handler: 'sms-campaign.testSms',
    },
    { // Path defined with an URL parameter
      method: 'POST',
      path: '/sms-campaigns/sms/group', 
      handler: 'sms-campaign.groupSms',
    },
    { // Path defined with an URL parameter
      method: 'GET',
      path: '/sms-campaigns/garden/:slug', 
      handler: 'sms-campaign.getByGarden',
    },

  ]
}