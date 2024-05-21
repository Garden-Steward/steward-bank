const request = require('supertest');
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
// user mock data

const messageMock = {
  body: "Can you water?",
  type: "question",
  user: 1,
};
const setupTask = async () => {

  await strapi.service('api::recurring-task.recurring-task').create({
    data: {
      title: 'Water the Garden',
      type: 'Water'
    }
  });
  await strapi.service('api::scheduler.scheduler').create({
    data: {
      day: 'Tuesday',
      backup_volunteers: [1],
      recurring_task: 1
    }
  });

  await strapi.service('api::garden-task.garden-task').create({
    data: {
      title: 'Water the Garden',
      type: 'Water',
      status: 'INITIALIZED',
      user: 1,
      recurring_task: 1
    }
  });
}

it("should deny if user has no task to transfer", async () => {
  const message = await strapi.db.query('api::message.message').create({
    data: {
    ...messageMock,
    },
  });
  console.log(message)

  await SmsHelper.transferTask({id:1}, 1)
    .then((data) => {
      console.log('trasnfer: ', data)
      expect(data.body).toEqual("You don't have a task to transfer right now");
    });
});

it("should transfer task", async () => {
  await setupTask();

  const entry = await strapi.db.query('api::message.message').update({
    where: { id: 1 },
    data: {
      garden_task: 1
    },
  });
  console.log(entry)
  
  await SmsHelper.transferTask({id:1}, 1)
    .then((data) => {
      console.log('trasnfer: ', data)
      expect(data.body).toEqual("Okay we've transferred to Cameron");
    });
});
