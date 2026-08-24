module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/weekly-schedules/:id/send',
      handler: 'weekly-schedule.send',
    }
  ]
};