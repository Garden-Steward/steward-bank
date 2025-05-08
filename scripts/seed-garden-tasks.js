const gardenTasksData = {
  tasks: [
    {
      title: "Walk the Garden",
      status: "PENDING",
      overview: "Regular watering of garden beds",
      type: "Water",
      max_volunteers: 2,
      publishedAt: new Date(),
      recurring_task_title: "Walk the Garden" // Will be used to link to recurring task
    },
    {
      title: "Plum Harvest",
      status: "INITIALIZED",
      overview: "Harvest ripe plums from the trees",
      type: "Harvest",
      max_volunteers: 4,
      publishedAt: new Date()
    },
    {
      title: "Garden Walk and Inspection",
      status: "STARTED",
      overview: "Daily garden inspection and maintenance check",
      type: "General",
      max_volunteers: 2,
      publishedAt: new Date(),
      recurring_task_title: "Walk the Garden"
    },
    {
      title: "Past Watering Task",
      status: "SKIPPED",
      overview: "Previous watering task",
      type: "Water",
      createdAt: new Date(2024, 1, 20),
      updatedAt: new Date(2024, 1, 22),
      max_volunteers: null,
      recurring_task_title: "Water Garden Beds"
    },
    {
      title: "Passion Fruit Maintenance",
      status: "FINISHED",
      overview: "Passion fruit vine maintenance and training",
      type: "General",
      createdAt: new Date(2024, 6, 6),
      updatedAt: new Date(2024, 6, 6),
      max_volunteers: 4,
      publishedAt: new Date(2024, 6, 6),
      recurring_task_title: "Water Garden Beds"
    }
  ]
};

async function seedGardenTasks(strapi) {
  try {
    console.log('Starting garden tasks seeding...');

    // Clean up existing garden tasks
    await strapi.db.query('api::garden-task.garden-task').deleteMany({
      where: {}
    });

    // Get all recurring tasks
    const recurringTasks = await strapi.db.query('api::recurring-task.recurring-task').findMany();

    // Create new garden tasks
    for (const task of gardenTasksData.tasks) {
      const { recurring_task_title, ...taskData } = task;
      
      // Find matching recurring task if title is provided
      let recurring_task = null;
      if (recurring_task_title) {
        recurring_task = recurringTasks.find(rt => rt.title === recurring_task_title)?.id;
      }

      await strapi.entityService.create('api::garden-task.garden-task', {
        data: {
          ...taskData,
          // Link to the first garden by default
          garden: (await strapi.db.query('api::garden.garden').findOne())?.id,
          // Add recurring task relationship if found
          recurring_task: recurring_task
        }
      });
    }

    console.log('Garden tasks seeding completed successfully');
  } catch (error) {
    console.error('Error seeding garden tasks:', error);
    throw error;
  }
}

module.exports = seedGardenTasks; 