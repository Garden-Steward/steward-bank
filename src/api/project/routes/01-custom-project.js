module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/projects/garden/:slug',
      handler: 'project.findByGarden',
    },
    {
      method: 'GET',
      path: '/projects/user',
      handler: 'project.findUserProjects',
    },
    {
      method: 'POST',
      path: '/projects/pitch',
      handler: 'project.pitch',
    },
    {
      method: 'POST',
      path: '/projects/:id/interest',
      handler: 'project.toggleInterest',
    },
    {
      method: 'PUT',
      path: '/projects/:id/managers',
      handler: 'project.updateManagers',
    },
  ],
};
