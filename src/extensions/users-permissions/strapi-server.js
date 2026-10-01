'use strict';

/**
 * /api/users/me always includes the caller's own role.
 *
 * Strapi v5 drops `populate=role` unless the caller may `find` roles, which no
 * app role is granted. Without it the web app can't tell that someone is an
 * Administrator, so admins don't get the lead controls on projects they don't
 * manage. Only the caller's own role is added; roles stay unlistable.
 */
module.exports = (plugin) => {
  const userController = plugin.controllers.user;
  const resolve = (strapi) => (typeof userController === 'function' ? userController({ strapi }) : userController);

  const wrapMe = (controller) => {
    const originalMe = controller.me;
    return {
      ...controller,
      async me(ctx) {
        await originalMe.call(controller, ctx);
        const role = ctx.state.user?.role;
        if (ctx.body && typeof ctx.body === 'object' && role) {
          ctx.body.role = { id: role.id, name: role.name, type: role.type };
        }
      },
    };
  };

  plugin.controllers.user = typeof userController === 'function'
    ? ({ strapi }) => wrapMe(resolve(strapi))
    : wrapMe(userController);

  return plugin;
};
