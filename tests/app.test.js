const fs = require('fs');
const { setupStrapi, cleanupStrapi, grantPrivileges } = require("./helpers/strapi");
const { restoreAll } = require("./helpers/patch");

jest.setTimeout(30000);
beforeAll(async () => {
  await setupStrapi();
  await grantPrivileges(2, ["permissions.application.controllers.hello.index"]);  // Gives Public access to endpoint
});

// Every module below shares one Strapi instance, so any service/repository stub
// a test installs must come back off after that test. See helpers/patch.js.
afterEach(() => {
  restoreAll();
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  await cleanupStrapi();
  await new Promise(resolve => setTimeout(resolve, 1000));
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
require('./user/vacation-reminders');
require('./tasks/transfer');
require('./tasks/poll');
require('./tasks/schedule');
require('./tasks/crontest');
require('./tasks/instruction');
require('./tasks/smsTask');
require('./tasks/publish');
require('./tasks/user-tasks.http');
require('./event/rsvp');
require('./event/messages');
require('./event/reminders');
require('./sms-campaign-vacation');

// Recurring event tests (unit tests for date calculations)
require('./recurring-events/date-calculations.test');
require('./recurring-events/instance-generation.test');

require('./tasks/standing-tasks');
require('./event/day-sheet');
