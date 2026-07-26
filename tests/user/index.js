const request = require('supertest');
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');

// user mock data
const mockUserData = {
  username: "tester3",
  firstName: "Henry",
  lastName: "Davis",
  email: "tester3@strapi.com",
  provider: "local",
  password: "1234abc",
  confirmed: true,
  blocked: null,
  paused: false,
  phoneNumber: '+13038833330'
};

describe('User Authentication Tests', () => {
  beforeEach(async () => {
    // Clean up any existing users with these emails/usernames
    await strapi.db.query('plugin::users-permissions.user').deleteMany({
      where: {
        email: {
          $in: [mockUserData.email, 'tester32@strapi.com']
        }
      }
    });
  });

  it("should login user and return jwt token", async () => {
    /** Creates a new user and save it to the database */
    await strapi.plugins["users-permissions"].services.user.add({
      ...mockUserData,
    });

    await request(strapi.server.httpServer) // app server is an instance of Class: http.Server
      .post("/api/auth/local")
      .set("accept", "application/json")
      .set("Content-Type", "application/json")
      .send({
        identifier: mockUserData.email,
        password: mockUserData.password,
      })
      .expect("Content-Type", /json/)
      .expect(200)
      .then((data) => {
        expect(data.body.jwt).toBeDefined();
      });
  });

  it('should return users data for authenticated user', async () => {
    /** Gets the default user role */
    const defaultRole = await strapi.query('plugin::users-permissions.role').findOne({}, []);

    const role = defaultRole ? defaultRole.id : null;

    /** Creates a new user an push to database */
    const user = await strapi.plugins['users-permissions'].services.user.add({
      ...mockUserData,
      username: 'tester23',
      email: 'tester32@strapi.com',
      role,
    });

    const jwt = strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    });

    await request(strapi.server.httpServer) // app server is an instance of Class: http.Server
      .get('/api/users/me')
      .set('accept', 'application/json')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer ' + jwt)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(data => {
        expect(data.body).toBeDefined();
        expect(data.body.id).toBe(user.id);
        expect(data.body.username).toBe(user.username);
        expect(data.body.email).toBe(user.email);
      });
  });
});

describe('User SMS tests', () => {
  const vacationTestUsers = [];

  afterEach(async () => {
    while (vacationTestUsers.length) {
      const id = vacationTestUsers.pop();
      await strapi.db.query('plugin::users-permissions.user').delete({ where: { id } });
    }
  });

  it('should pause user account (AC12: startVacation)', async () => {
    const user = await strapi.db.query('plugin::users-permissions.user').create({
      data: {
        ...mockUserData,
        username: `tester-vacation-start-${Date.now()}`,
        email: `tester-vacation-start-${Date.now()}@strapi.com`,
        paused: false
      }
    });
    vacationTestUsers.push(user.id);

    const data = await SmsHelper.startVacation(user);
    expect(data.body).toContain("Hi Henry, your account is now paused. Enjoy your vacation!");

    const updated = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: user.id } });
    expect(updated.paused).toBe(true);
    expect(updated.paused_at).not.toBeNull();
    expect(updated.vacation_reminder_count).toBe(0);
  });

  it('should end vacation for a paused user (AC10: endVacation)', async () => {
    const user = await strapi.db.query('plugin::users-permissions.user').create({
      data: {
        ...mockUserData,
        username: `tester-vacation-end-${Date.now()}`,
        email: `tester-vacation-end-${Date.now()}@strapi.com`,
        paused: true,
        paused_at: new Date(),
        vacation_reminder_count: 3,
        last_vacation_check_sent: new Date()
      }
    });
    vacationTestUsers.push(user.id);

    const data = await SmsHelper.endVacation(user);
    expect(data.body).toContain("Welcome back");

    const updated = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: user.id } });
    expect(updated.paused).toBe(false);
    expect(updated.paused_at).toBeNull();
    expect(updated.vacation_reminder_count).toBe(0);
    expect(updated.last_vacation_check_sent).toBeNull();
  });

  it('should not pause a non-paused user who texts BACK (AC11: regression guard)', async () => {
    const user = await strapi.db.query('plugin::users-permissions.user').create({
      data: {
        ...mockUserData,
        username: `tester-vacation-guard-${Date.now()}`,
        email: `tester-vacation-guard-${Date.now()}@strapi.com`,
        paused: false
      }
    });
    vacationTestUsers.push(user.id);

    const data = await SmsHelper.endVacation(user);
    expect(data.body).toContain("already active");

    const updated = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: user.id } });
    expect(updated.paused).toBe(false);
  });
});

