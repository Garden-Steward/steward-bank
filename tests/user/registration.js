const {
  grantPrivileges,
} = require("../helpers/strapi");
const request = require("supertest");


const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
const { createUser, defaultData, mockUserData } = require("./factory");
const { patch, patchQuery, patchService } = require('../helpers/patch');

// Mock Mailchimp module
jest.mock('@mailchimp/mailchimp_marketing', () => ({
  setConfig: jest.fn(),
  lists: {
    addListMember: jest.fn().mockResolvedValue({})
  }
}));

beforeAll(async () => {

  await grantPrivileges(
    2,
    "plugin::users-permissions.controllers.auth.emailConfirmation"
  );

  user = await createUser({
    confirmed: false,
  });
});

describe("Join Garden", () => {
  it('should prompt for email when joining garden as new user', async () => {
    const phoneNumber = '+13038833330';
    const mockGarden = {
      id: 1,
      title: 'Test Garden'
    };
    
    // Mock user with test@test.com email
    const mockUser = {
      id: 1,
      email: 'test@test.com',
      phoneNumber: phoneNumber
    };

    const response = await SmsHelper.joinGarden(mockUser, phoneNumber, mockGarden);

    expect(response.type).toBe('registration');
    expect(response.body).toBe('Looks like we still need an email, what email would you like to be informed about volunteering?');
  });

  it('should not send the contact card before it is mentioned', async () => {
    const phoneNumber = '+13038833331';
    const mockGarden = { id: 1, title: 'Test Garden' };

    const sendContactCard = patch(SmsHelper, 'sendContactCard', jest.fn().mockResolvedValue(true));
    patchQuery('plugin::users-permissions.user', 'create', jest.fn().mockResolvedValue({ id: 99 }));

    const response = await SmsHelper.joinGarden(null, phoneNumber, mockGarden);

    expect(response.type).toBe('registration');
    expect(sendContactCard).not.toHaveBeenCalled();
  });
});

describe('Contact card', () => {
  it('should send the card with the welcome text that mentions it', async () => {
    const phoneNumber = '+13038833331';
    const mockUser = { id: 1, phoneNumber };

    const sendContactCard = patch(SmsHelper, 'sendContactCard', jest.fn().mockResolvedValue(true));
    patchQuery('plugin::users-permissions.user', 'update', jest.fn().mockResolvedValue(mockUser));

    const response = await SmsHelper.saveVolunteerName(mockUser, 'ada lovelace');

    expect(sendContactCard).toHaveBeenCalledWith(phoneNumber);
    expect(response.body).toContain("I've just sent you my contact card");
    expect(response.type).toBe('complete');
  });

  it('should not send the card when the name is rejected', async () => {
    const phoneNumber = '+13038833331';
    const mockUser = { id: 1, phoneNumber };

    const sendContactCard = patch(SmsHelper, 'sendContactCard', jest.fn().mockResolvedValue(true));
    patchQuery('plugin::users-permissions.user', 'update', jest.fn().mockRejectedValue(new Error('duplicate username')));

    const response = await SmsHelper.saveVolunteerName(mockUser, 'ada lovelace');

    expect(sendContactCard).not.toHaveBeenCalled();
    expect(response.body).toContain("Sorry we can't accept this name");
  });

  it('should still return the welcome text when Twilio fails', async () => {
    const phoneNumber = '+13038833331';
    const mockUser = { id: 1, phoneNumber };

    patchService('api::sms.sms', 'sendContactCard', jest.fn().mockRejectedValue(new Error('Twilio 500')));
    patchQuery('plugin::users-permissions.user', 'update', jest.fn().mockResolvedValue(mockUser));

    const response = await SmsHelper.saveVolunteerName(mockUser, 'ada lovelace');

    expect(response.type).toBe('complete');
    expect(response.body).toContain('Welcome to the team');
  });
  
});

describe("SMS Registration", () => {
  let user;
  
  // it('should allow email submission', async () => {
  //   let responseTxt = 'cameron@strapi.com';
  //   let user = {
  //     id: 1,
  //     phone: '+13038833330',
  //   };
  //   const jwt = strapi.plugins["users-permissions"].services.jwt.issue({
  //     id: user.id,
  //   });
  //   await request(strapi.server.httpServer) // app server is and instance of Class: http.Server
  //   .post("/api/sms")
  //   // .set("accept", "application/json")
  //   // .set("Content-Type", "application/json")
  //   .send({
  //     // twilio request body
  //   })
  //   .expect(200)
  //   .then(async (data) => {
  //     console.log('twiml response: ', data);

  //   });
  // });
});



describe('Updating User Info', () => {
  // it('should send a contact card', async () => {
  //   let testNumber = '+13038833330';
  //   let result = await SmsHelper.sendContactCard(testNumber);
  //   console.log(result);
  //   expect(result.to).toBe(testNumber);
  // });

  it('should save volunteer email', async () => {
    let user = {
      id: 1,
      phone: '+13038833330',
      email: 'test@test.com'
    };
    
    let result = await SmsHelper.saveVolunteerEmail(user, 'cameron+test1@oufp.org');
    expect(result.body).toContain('Thank you!');
  });
});

describe('User Registration', () => {
  
  it('should manage registration names properly', async () => {
    let responseTxt = 'john SMITH';
    let user = {
      id: 1,
      phone: '+13038833330',
    };
    let smsInfo = await SmsHelper.saveVolunteerName(user, responseTxt);
    expect(smsInfo.body).toContain('Welcome to the team John Smith');
    
    responseTxt = 'Madonna';
    smsInfo = await SmsHelper.saveVolunteerName(user, responseTxt);
    expect(smsInfo.body).toContain('Welcome to the team Madonna');
  });
});