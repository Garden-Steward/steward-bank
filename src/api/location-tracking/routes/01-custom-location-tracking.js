module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/location-trackings/nearby-gardens',
      handler: 'location-tracking.nearbyGardens',
    },
    {
      method: 'PUT',
      path: '/location-trackings/:id/confirm-garden',
      handler: 'location-tracking.confirmGarden',
    },
    {
      method: 'GET',
      path: '/location-trackings/garden/:slug',
      handler: 'location-tracking.findByGarden',
    },
  ],
};
