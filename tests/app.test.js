const fs = require('fs');
const { setupStrapi, cleanupStrapi, grantPrivileges } = require("./helpers/strapi");

jest.setTimeout(15000)
beforeAll(async () => {
  await setupStrapi();
  await grantPrivileges(2, ["permissions.application.controllers.hello.index"]);  // Gives Public access to endpoint
});

afterAll(async () => {
  await cleanupStrapi();
});

it("strapi is defined", () => {
  expect(strapi).toBeDefined();
});

require('./user');
require('./general');
require('./general/weather');
require('./general/twilio');
require('./user/registration');
require('./user/user.http');
require('./tasks/transfer');
require('./tasks/schedule');
require('./tasks/crontest');
require('./tasks/instruction');
require('./event/rsvp');
