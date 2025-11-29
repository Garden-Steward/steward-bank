module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/projects/garden/:slug',
      handler: 'project.findByGarden',
    }
  ]
};

