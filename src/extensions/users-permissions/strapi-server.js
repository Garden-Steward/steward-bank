'use strict';

/**
 * /api/users/me always includes the caller's own role.
 *
 * Strapi v5 drops `populate=role` unless the caller may `find` roles, which no
 * app role is granted. Without it the web app can't tell that someone is an
 * Administrator, so admins don't get the lead controls on projects they don't
 * manage. Only the caller's own role is added; roles stay unlistable.
 *
 * GET /api/users is refused to anyone but Administrators. Members hold
 * user.find only so the REST sanitizer keeps populated users (see
 * MEMBER_ACTIONS in src/index.js); the list itself would hand them every
 * user's email and phone. API tokens have no user and pass through.
 */
module.exports = (plugin) => {
  const userController = plugin.controllers.user;
  const resolve = (strapi) => (typeof userController === 'function' ? userController({ strapi }) : userController);

  const wrap = (controller) => {
    const originalMe = controller.me;
    const originalFind = controller.find;
    return {
      ...controller,
      async me(ctx) {
        await originalMe.call(controller, ctx);
        const role = ctx.state.user?.role;
        if (ctx.body && typeof ctx.body === 'object' && role) {
          ctx.body.role = { id: role.id, name: role.name, type: role.type };
        }
      },
      async find(ctx) {
        const user = ctx.state.user;
        if (user && user.role?.type !== 'administrator') return ctx.forbidden();
        return originalFind.call(controller, ctx);
      },
    };
  };

  plugin.controllers.user = typeof userController === 'function'
    ? ({ strapi }) => wrap(resolve(strapi))
    : wrap(userController);

  return plugin;
};
