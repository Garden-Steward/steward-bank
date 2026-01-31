
module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/garden-tasks/rsvp/:id',
      handler: 'garden-task.rsvpTask',
    },
  ]
}
