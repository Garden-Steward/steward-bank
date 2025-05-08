const messagesData = {
  messages: [
    // First conversation about garden walk
    {
      body: "Hi Cameron, it's your daily garden walk time! Are you able to do the inspection today? You have some OPTIONS.",
      type: "question",
      previous: null,
      meta_data: null,
      task_title: "Walk the Garden",
      username: "cpres"
    },
    {
      body: "Hi Cameron, you have 1 open task. YES if you can do the task. NO if want to transfer. SKIP if it isn't needed. ",
      type: "reply",
      previous: "Options",
      meta_data: null,
      task_title: "Walk the Garden",
      username: "cpres"
    },
    {
      body: "YES, I can do the garden walk now.",
      type: "reply",
      previous: "YES",
      meta_data: null,
      task_title: "Walk the Garden",
      
      username: "cpres"
    },

    // Watering task conversation
    {
      body: "Recent watering updates: \nThu Jun 29 by Cameron O: SKIPPED\n Fri Jun 09 by Cameron O: SKIPPED\n ",
      type: "reply",
      previous: "Water schedule",
      meta_data: null,
      task_title: "Past Watering Task",
      username: "cpres"
    },
    {
      body: "Would you like to skip today's watering task?",
      type: "question",
      previous: null,
      meta_data: null,
      task_title: "Past Watering Task",
      username: "cpres"
    },
    {
      body: "SKIP - It rained yesterday",
      type: "reply",
      previous: "SKIP",
      meta_data: null,
      task_title: "Past Watering Task",
      username: "cpres"
    },

    // Plum harvest conversation
    {
      body: "Time to harvest the plums! Are you available?",
      type: "question",
      previous: null,
      meta_data: null,
      task_title: "Plum Harvest",
      username: "cpres"
    },
    {
      body: "The task can't be transferred, sorry!",
      type: "reply",
      previous: "No",
      meta_data: null,
      task_title: "Plum Harvest",
      username: "cpres"
    },

    // Passion fruit maintenance conversation with final message from Sasha
    {
      body: "Starting passion fruit maintenance now",
      type: "notification",
      previous: null,
      meta_data: null,
      task_title: "Passion Fruit Maintenance",
      username: "cpres"
    },
    {
      body: "DONE :) - Pruned and trained the vines",
      type: "followup",
      previous: null,
      meta_data: null,
      task_title: "Passion Fruit Maintenance",
      username: "sasha"
    }
  ]
};

async function seedMessages(strapi) {
  try {
    console.log('Starting messages seeding...');

    // Clean up existing messages
    await strapi.db.query('api::message.message').deleteMany({
      where: {}
    });

    // Get all garden tasks
    const gardenTasks = await strapi.db.query('api::garden-task.garden-task').findMany({
      populate: ['garden']
    });

    // Get all users
    const users = await strapi.db.query('plugin::users-permissions.user').findMany();

    // Create new messages
    for (const message of messagesData.messages) {
      const { task_title, username, ...messageData } = message;
      
      // Find matching garden task if title is provided
      let garden_task = null;
      if (task_title) {
        const task = gardenTasks.find(gt => gt.title === task_title);
        if (task) {
          garden_task = task.id;
        }
      }

      // Find matching user if username is provided
      let user = null;
      if (username) {
        user = users.find(u => u.username === username)?.id;
      }

      await strapi.entityService.create('api::message.message', {
        data: {
          ...messageData,
          garden_task,
          garden: gardenTasks[0]?.garden?.id,
          user,
          publishedAt: new Date()
        }
      });
    }

    console.log('Messages seeding completed successfully');
  } catch (error) {
    console.error('Error seeding messages:', error);
    throw error;
  }
}

module.exports = seedMessages; 