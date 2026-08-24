
module.exports = {
  routes: [
    {
      // Must be declared before the core `/garden-tasks/:id` route so "user"
      // isn't swallowed by the findOne `:id` param (which 404s).
      method: 'GET',
      path: '/garden-tasks/user',
      handler: 'garden-task.userTasks',
    },
    {
      method: 'POST',
      path: '/garden-tasks/rsvp/:id',
      handler: 'garden-task.rsvpTask',
    },
  ]
}
