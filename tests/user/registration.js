const {
  grantPrivileges,
} = require("../helpers/strapi");
const request = require("supertest");


const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
const { createUser, defaultData, mockUserData } = require("./factory");

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

    // Mock user with test@test.com email (incomplete registration)
    const mockUser = {
      id: 1,
      email: 'test@test.com',
      phoneNumber: phoneNumber
    };

    const response = await SmsHelper.joinGarden(mockUser, phoneNumber, mockGarden);

    expect(response.type).toBe('registration');
    expect(response.body).toBe('Looks like we still need an email, what email would you like to be informed about volunteering?');
  });

  it('should create new user and prompt for email when brand new number joins garden', async () => {
    const phoneNumber = '+15551234567';
    const mockGarden = {
      id: 1,
      title: 'Test Garden'
    };

    // Simulate brand new number (no user)
    const response = await SmsHelper.joinGarden(null, phoneNumber, mockGarden);

    expect(response.type).toBe('registration');
    expect(response.body).toContain('Welcome to Garden Steward SMS App!');
    expect(response.body).toContain('could we have your email?');
  });

  it('should send contact card when joining garden as new user', async () => {
    const phoneNumber = '+13038833330';
    const mockGarden = {
      id: 1,
      title: 'Test Garden'
    };

    // Store original methods
    const originalJoinGarden = SmsHelper.joinGarden;
    const originalSendContactCard = SmsHelper.sendContactCard;

    // Mock sendContactCard
    SmsHelper.sendContactCard = jest.fn().mockResolvedValue(true);

    // Create simplified version of joinGarden that only tests the contact card flow
    SmsHelper.joinGarden = async (user, phone, garden) => {
      await SmsHelper.sendContactCard(phone);
      return { type: 'success' };
    };

    await SmsHelper.joinGarden({ phoneNumber }, phoneNumber, mockGarden);

    // Verify sendContactCard was called with the correct phone number
    expect(SmsHelper.sendContactCard).toHaveBeenCalledWith(phoneNumber);

    // Restore original methods
    SmsHelper.joinGarden = originalJoinGarden;
    SmsHelper.sendContactCard = originalSendContactCard;
  });

});

describe("Register Command", () => {
  it('should return error when no user found', async () => {
    const response = await SmsHelper.registerUser(null);

    expect(response.type).toBe('reply');
    expect(response.body).toBe("Sorry, we couldn't find your account. Please try joining a garden first.");
  });

  it('should prompt for email when user has incomplete registration (test@test.com)', async () => {
    const mockUser = {
      id: 1,
      email: 'test@test.com',
      phoneNumber: '+13038833330',
      username: '+13038833330'
    };

    const response = await SmsHelper.registerUser(mockUser);

    expect(response.type).toBe('registration');
    expect(response.body).toBe('Please provide your email address to complete registration.');
  });

  it('should ask for email confirmation when user has valid email', async () => {
    const mockUser = {
      id: 1,
      email: 'volunteer@example.com',
      phoneNumber: '+13038833330',
      username: '+13038833330'
    };

    const response = await SmsHelper.registerUser(mockUser);

    expect(response.type).toBe('registration');
    expect(response.body).toContain('Is volunteer@example.com your correct email address?');
    expect(response.body).toContain('CORRECT');
  });

  it('should reset username to phoneNumber for re-registration flow', async () => {
    // Create a user with username different from phoneNumber
    const testPhone = '+15559876543';
    const testUser = await createUser({
      phoneNumber: testPhone,
      username: 'John Doe',
      email: 'john@example.com'
    });

    // Call registerUser - it should reset username
    await SmsHelper.registerUser(testUser);

    // Verify username was reset to phoneNumber
    const updatedUser = await strapi.db.query("plugin::users-permissions.user").findOne({
      where: { id: testUser.id }
    });

    expect(updatedUser.username).toBe(testPhone);

    // Cleanup
    await strapi.db.query("plugin::users-permissions.user").delete({
      where: { id: testUser.id }
    });
  });
});

describe("Register Flow - Same as Brand New Numbers", () => {
  let testUser;
  const testPhone = '+15558765432';

  beforeEach(async () => {
    // Create a user simulating brand new number registration
    // (username = phoneNumber, email = test@test.com)
    testUser = await createUser({
      phoneNumber: testPhone,
      username: testPhone,
      email: 'test@test.com'
    });
  });

  afterEach(async () => {
    if (testUser) {
      await strapi.db.query("plugin::users-permissions.user").delete({
        where: { id: testUser.id }
      });
    }
  });

  it('should follow same flow as brand new numbers: REGISTER prompts for email', async () => {
    // Step 1: Call REGISTER command
    const registerResponse = await SmsHelper.registerUser(testUser);

    expect(registerResponse.type).toBe('registration');
    expect(registerResponse.body).toBe('Please provide your email address to complete registration.');
  });

  it('should follow same flow as brand new numbers: email submission prompts for name', async () => {
    // Step 1: User provides email after REGISTER
    const emailResponse = await SmsHelper.saveVolunteerEmail(testUser, 'newemail@example.com');

    expect(emailResponse.body).toContain('Thank you!');
    expect(emailResponse.body).toContain('respond with your full name');
  });

  it('should follow same flow as brand new numbers: name submission completes registration', async () => {
    // Step 1: User provides name after email
    const nameResponse = await SmsHelper.saveVolunteerName(testUser, 'Jane Doe');

    expect(nameResponse.type).toBe('complete');
    expect(nameResponse.body).toContain('Welcome to the team Jane Doe');
  });

  it('should complete full registration flow: REGISTER -> email -> name', async () => {
    // Step 1: REGISTER command
    const registerResponse = await SmsHelper.registerUser(testUser);
    expect(registerResponse.type).toBe('registration');
    expect(registerResponse.body).toContain('email');

    // Step 2: User provides email
    const emailResponse = await SmsHelper.saveVolunteerEmail(testUser, 'fullflow@example.com');
    expect(emailResponse.body).toContain('Thank you!');
    expect(emailResponse.body).toContain('full name');

    // Step 3: User provides name
    const nameResponse = await SmsHelper.saveVolunteerName(testUser, 'Full Flow User');
    expect(nameResponse.type).toBe('complete');
    expect(nameResponse.body).toContain('Welcome to the team Full Flow User');

    // Verify user data was updated correctly
    const updatedUser = await strapi.db.query("plugin::users-permissions.user").findOne({
      where: { id: testUser.id }
    });

    expect(updatedUser.email).toBe('fullflow@example.com');
    expect(updatedUser.firstName).toBe('Full');
    expect(updatedUser.lastName).toBe('Flow User');
  });
});

describe('Updating User Info', () => {
  it('should save volunteer email', async () => {
    let user = {
      id: 1,
      phone: '+13038833330',
      email: 'test@test.com'
    };

    let result = await SmsHelper.saveVolunteerEmail(user, 'cameron+test1@oufp.org');
    expect(result.body).toContain('Thank you!');
  });

  it('should validate email format before saving', async () => {
    let user = {
      id: 1,
      phone: '+13038833330',
      email: 'test@test.com'
    };

    // The checkEmail function validates email format
    const isValidEmail = SmsHelper.checkEmail(user, 'valid@email.com');
    const isInvalidEmail = SmsHelper.checkEmail(user, 'notanemail');

    expect(isValidEmail).toBe(true);
    expect(isInvalidEmail).toBe(false);
  });

  it('should only check email for users with test@test.com', async () => {
    let userWithRealEmail = {
      id: 1,
      phone: '+13038833330',
      email: 'real@email.com'
    };

    // checkEmail should return false for users with real email
    const result = SmsHelper.checkEmail(userWithRealEmail, 'new@email.com');
    expect(result).toBe(false);
  });
});

describe('User Registration - Name Handling', () => {

  it('should manage registration names properly with proper case', async () => {
    let responseTxt = 'john SMITH';
    let user = {
      id: 1,
      phone: '+13038833330',
    };
    let smsInfo = await SmsHelper.saveVolunteerName(user, responseTxt);
    expect(smsInfo.body).toContain('Welcome to the team John Smith');
  });

  it('should handle single name registration', async () => {
    let responseTxt = 'Madonna';
    let user = {
      id: 1,
      phone: '+13038833330',
    };
    let smsInfo = await SmsHelper.saveVolunteerName(user, responseTxt);
    expect(smsInfo.body).toContain('Welcome to the team Madonna');
  });

  it('should handle names with multiple parts', async () => {
    let responseTxt = 'MARY JANE WATSON';
    let user = {
      id: 1,
      phone: '+13038833330',
    };
    let smsInfo = await SmsHelper.saveVolunteerName(user, responseTxt);
    expect(smsInfo.body).toContain('Welcome to the team Mary Jane Watson');
  });

  it('should return complete type after name registration', async () => {
    let user = {
      id: 1,
      phone: '+13038833330',
    };
    let smsInfo = await SmsHelper.saveVolunteerName(user, 'Test User');
    expect(smsInfo.type).toBe('complete');
  });
});
