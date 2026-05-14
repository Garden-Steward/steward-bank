const messagesData = [
  // --- Registration flow (no garden_task) ---
  {
    body: "Welcome to Garden Steward SMS App! So glad to hear you're interested in volunteering for Downtown Community Garden. To start could we have your email?",
    type: "registration",
    previous: "Downtown Community Garden",
    meta_data: null,
    task_title: null,
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "Great! Your email has been confirmed. Could you please provide your full name?",
    type: "registration",
    previous: "correct",
    meta_data: null,
    task_title: null,
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },

  // --- Watering task — question + reply thread ---
  {
    body: "Hi Cameron, it's your watering day! Are you able to water today? You have some OPTIONS.",
    type: "question",
    previous: null,
    meta_data: null,
    task_title: "Walk the Garden",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "Hi Cameron, you have 1 open task. YES if you can do it. NO to transfer. SKIP if it isn't needed.",
    type: "reply",
    previous: "Options",
    meta_data: null,
    task_title: "Walk the Garden",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "YES, I can do the garden walk now.",
    type: "reply",
    previous: "YES",
    meta_data: null,
    task_title: "Walk the Garden",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "Great! Let us know when you're done — just reply DONE.",
    type: "notification",
    previous: "YES",
    meta_data: null,
    task_title: "Walk the Garden",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "DONE :) — walked the garden and checked all the beds.",
    type: "followup",
    previous: "DONE",
    meta_data: null,
    task_title: "Walk the Garden",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },

  // --- Past watering task (skipped) ---
  {
    body: "Recent watering updates:\nThu Jun 29 by Cameron O: SKIPPED\nFri Jun 09 by Cameron O: SKIPPED",
    type: "reply",
    previous: "Water schedule",
    meta_data: null,
    task_title: "Past Watering Task",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "Hi Cameron, it's your watering day! Are you able to water today? You have some OPTIONS.",
    type: "question",
    previous: null,
    meta_data: null,
    task_title: "Past Watering Task",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "SKIP — It rained yesterday",
    type: "reply",
    previous: "SKIP",
    meta_data: null,
    task_title: "Past Watering Task",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },

  // --- Plum harvest — transfer attempt ---
  {
    body: "Time to harvest the plums! Are you available? You have some OPTIONS.",
    type: "question",
    previous: null,
    meta_data: null,
    task_title: "Plum Harvest",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "The task can't be transferred right now, sorry!",
    type: "reply",
    previous: "No",
    meta_data: null,
    task_title: "Plum Harvest",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },

  // --- Passion fruit (finished task) ---
  {
    body: "Starting passion fruit maintenance now.",
    type: "notification",
    previous: null,
    meta_data: null,
    task_title: "Passion Fruit Maintenance",
    garden_title: "Downtown Community Garden",
    username: "cpres"
  },
  {
    body: "DONE :) — Pruned and trained the vines",
    type: "followup",
    previous: "DONE",
    meta_data: null,
    task_title: "Passion Fruit Maintenance",
    garden_title: "Downtown Community Garden",
    username: "sasha"
  },

  // --- Neighborhood Garden: watering conversation ---
  {
    body: "Welcome to Garden Steward SMS App! So glad to hear you're interested in volunteering for Neighborhood Garden. To start could we have your email?",
    type: "registration",
    previous: "Neighborhood Garden",
    meta_data: null,
    task_title: null,
    garden_title: "Neighborhood Garden",
    username: "sasha"
  },
  {
    body: "Hi Sasha, it's your watering day! Are you able to water today? You have some OPTIONS.",
    type: "question",
    previous: null,
    meta_data: null,
    task_title: "Garden Walk and Inspection",
    garden_title: "Neighborhood Garden",
    username: "sasha"
  },
  {
    body: "YES — on my way to the garden now!",
    type: "reply",
    previous: "YES",
    meta_data: null,
    task_title: "Garden Walk and Inspection",
    garden_title: "Neighborhood Garden",
    username: "sasha"
  },
  {
    body: "All done — garden looks great today.",
    type: "followup",
    previous: "DONE",
    meta_data: null,
    task_title: "Garden Walk and Inspection",
    garden_title: "Neighborhood Garden",
    username: "sasha"
  },
];

async function seedMessages(strapi) {
  try {
    console.log('Starting messages seeding...');

    await strapi.db.query('api::message.message').deleteMany({ where: {} });

    const gardenTasks = await strapi.db.query('api::garden-task.garden-task').findMany({
      populate: ['garden']
    });
    const users = await strapi.db.query('plugin::users-permissions.user').findMany();
    const gardens = await strapi.db.query('api::garden.garden').findMany();

    for (const message of messagesData) {
      const { task_title, garden_title, username, ...messageData } = message;

      const task = task_title
        ? gardenTasks.find(gt => gt.title === task_title)
        : null;

      // Use the task's own garden when available so messages appear under
      // the correct garden in fetchTaskMessages; fall back to named garden.
      let gardenId = task?.garden?.id ?? null;
      if (!gardenId && garden_title) {
        gardenId = gardens.find(g => g.title === garden_title)?.id ?? null;
      }

      const userId = username
        ? users.find(u => u.username === username)?.id ?? null
        : null;

      await strapi.entityService.create('api::message.message', {
        data: {
          ...messageData,
          garden_task: task?.id ?? null,
          garden: gardenId,
          user: userId,
          publishedAt: new Date(),
        }
      });
    }

    console.log(`Messages seeding completed — ${messagesData.length} messages created`);
  } catch (error) {
    console.error('Error seeding messages:', error);
    throw error;
  }
}

module.exports = seedMessages;
