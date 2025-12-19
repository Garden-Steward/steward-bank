
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/volunteer-days/garden/:gardenId/media',
      handler: 'volunteer-day.getGardenMedia',
    },
  ]
}
