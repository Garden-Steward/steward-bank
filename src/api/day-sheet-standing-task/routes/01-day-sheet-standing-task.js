'use strict';

module.exports = {
  routes: [
    {
      method: 'PUT',
      path: '/day-sheet-standing-tasks/list',
      handler: 'day-sheet-standing-task.replaceList',
      config: { policies: [], middlewares: [] },
    },
  ],
};
