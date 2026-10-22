'use strict';

// Authorization (who can see which org) is enforced in the controller; these
// routes only need the users-permissions grant (authenticated/administrator).
module.exports = {
  routes: [
    { method: 'GET', path: '/organizations/usage', handler: 'organization.usageList' },
    { method: 'GET', path: '/organizations/:documentId/usage', handler: 'organization.usageReport' },
  ],
};
