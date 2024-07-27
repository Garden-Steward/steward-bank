const {schedulers} = require('../tasks/schedulersMock.js');

module.exports = {
  recurring_task: {
    id: 1,
    title: 'Water the garden',
    garden: 1,
    overview: 'Water the garden whenever its your turn',
    scheduler_type: 'Weekly Shuffle',
    type: 'Water',
    schedulers
  }
}
