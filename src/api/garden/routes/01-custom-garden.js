
module.exports = {
  routes: [
    { // Path defined with an URL parameter
      method: 'GET',
      path: '/gardens/:slug/full', 
      handler: 'garden.fullSlug',
    },
    { // Day-sheet JSON for a whole garden. Unauthenticated for the same reason
      // the volunteer-day one is: the payload carries no volunteer identity,
      // and the task list it draws on is already public. The print CONTROL is
      // manager-only in the app; that is a UI decision, not a data boundary.
      method: 'GET',
      path: '/gardens/:slug/day-sheet',
      handler: 'garden.getDaySheet',
      config: { auth: false },
    },
    { // The printable sheet. Opened in a fresh tab straight from the print
      // dialog, so it must not depend on a session.
      method: 'GET',
      path: '/gardens/:slug/day-sheet.html',
      handler: 'garden.getDaySheetHtml',
      config: { auth: false },
    },
    { // This garden's every-volunteer-day checklist, for the editor to load.
      // Unauthenticated like the sheet it feeds, and for the same reason.
      method: 'GET',
      path: '/gardens/:slug/standing-tasks',
      handler: 'garden.getStandingTasks',
      config: { auth: false },
    },
    { // Replace this garden's checklist. Authorization is in the controller,
      // not here: users-permissions grants are role-wide, so this route only
      // gets a logged-in request as far as the manager check.
      method: 'PUT',
      path: '/gardens/:slug/standing-tasks',
      handler: 'garden.replaceStandingTasks',
    }
  ]
}