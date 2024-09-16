const {
  grantPrivileges,
} = require("../helpers/strapi");
const request = require("supertest");
const helpers = require('../helpers/twilio-runtime');

const { createUser, defaultData, mockUserData } = require("../user/factory");

var context = {
  API_KEY: process.env.ACCOUNT_SID,
  API_SECRET: process.env.AUTH_TOKEN,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_SID,
  OUTBOUND_PHONE_NUMBER: process.env.OUTBOUND_PHONE_NUMBER,
};

beforeAll(async () => {
  helpers.setup(context);
  jest.setTimeout(10000);
  await grantPrivileges(
    2,
    "plugin::users-permissions.controllers.auth.emailConfirmation"
  );

  user = await createUser({
    confirmed: false,
  });
});
afterAll(() => {
  helpers.teardown();
});

describe("Default Twilio methods", () => {

  it('should send a message', async () => {
    const message = await context
    .getTwilioClient()
    .messages.create({
      to: '+13038833330',
      from: '+13038833330',
      body: 'Hello world!',
    })
    expect(message).toBeDefined();
  });
});