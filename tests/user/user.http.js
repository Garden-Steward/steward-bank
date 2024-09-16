const {
  grantPrivileges,
} = require("../helpers/strapi");
const request = require("supertest");

const { createUser, defaultData, mockUserData } = require("./factory");

beforeAll(async () => {

  await grantPrivileges(
    2,
    "plugin::users-permissions.controllers.auth.emailConfirmation"
  );

  user = await createUser({
    confirmed: false,
  });
});

describe("Default User methods", () => {
  let user;
  it('should create a new user', async () => {
    user = await createUser({
      confirmed: false,
      phone: '+13038833330',
    });
    expect(user).toBeDefined();
  });

  it("should login user and return jwt token", async () => {
    const jwt = strapi.plugins["users-permissions"].services.jwt.issue({
      id: user.id,
    });
    await request(strapi.server.httpServer) // app server is and instance of Class: http.Server
    .post("/api/auth/local")
    .set("accept", "application/json")
    .set("Content-Type", "application/json")
    .send({
      identifier: user.email,
      password: defaultData.password,
    })
    .expect("Content-Type", /json/)
    .expect(200)
    .then(async (data) => {
      expect(data.body.jwt).toBeDefined();
      const verified = await strapi.plugins[
        "users-permissions"
      ].services.jwt.verify(data.body.jwt);

      expect(data.body.jwt === jwt || !!verified).toBe(true); // jwt does have a random seed, each issue can be different
    });
  });
});