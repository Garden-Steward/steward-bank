const utils = require("@strapi/utils");

const taskHelper = {};

/**
 * Invites an unknown user to join a garden and then RSVPs them to a task
 * Similar to volunteer-day inviteUserEvent
 * @param {object} data - { phoneNumber, task }
 * @returns {object} - { success, body, needsRegistration }
 */
taskHelper.inviteUserTask = async (data) => {
  const garden = data.task.garden;

  // Check if sms_slug matches the start of the garden title (case insensitive)
  // This is important because checkGarden() uses startsWith matching
  const titleStart = garden.title.toLowerCase().split(' ')[0];
  const slugMatchesTitle = garden.title.toLowerCase().startsWith(garden.sms_slug.toLowerCase());

  let replyInstruction;
  if (slugMatchesTitle) {
    replyInstruction = `reply with ${garden.title}`;
  } else {
    // If slug doesn't match title start, be explicit about what to reply
    replyInstruction = `reply with ${garden.sms_slug.toUpperCase()}`;
  }

  const body = `Hello! Interested in helping with "${data.task.title}" at ${garden.title}? To get started, ${replyInstruction}. We'll walk you through a quick registration.`;

  await strapi.service('api::sms.sms').handleSms({
    user: { phoneNumber: data.phoneNumber },
    meta_data: {
      phoneNumber: data.phoneNumber,
      taskId: data.task.id,
      gardenId: garden.id
    },
    body,
    type: 'registration',
    task: data.task
  });

  return {
    success: true,
    body,
    needsRegistration: true,
    garden: {
      id: garden.id,
      title: garden.title,
      sms_slug: garden.sms_slug
    }
  };
};

/**
 * RSVPs a registered user to a task
 * - Adds user to task volunteers if not already
 * - Sets status to STARTED if not already started
 * - Returns instruction info
 * @param {string} taskId
 * @param {object} data - { userId, user, task }
 * @returns {object} - { success, task, instruction }
 */
taskHelper.rsvpTask = async (taskId, data) => {
  let task = await strapi.db.query('api::garden-task.garden-task').findOne({
    populate: ['volunteers', 'instruction', 'recurring_task', 'recurring_task.instruction', 'garden', 'primary_image'],
    where: { id: taskId }
  });

  if (!task) {
    throw new Error("Task not found");
  }

  const user = data.user;
  const isAlreadyVolunteer = task.volunteers?.some(v => v.id === user.id);

  // Add user to volunteers if not already
  if (!isAlreadyVolunteer) {
    await strapi.service('api::garden-task.garden-task').addUserToTask(task, user);
  }

  // Update status to STARTED if not already started/finished
  const needsStatusUpdate = ['INITIALIZED', 'PENDING', 'INTERESTED'].includes(task.status);
  if (needsStatusUpdate) {
    // Prepare update data
    const updateData = {
      status: 'STARTED',
      started_at: new Date()
    };

    // If status is changing from INITIALIZED, publish the task
    if (task.status === 'INITIALIZED') {
      updateData.publishedAt = new Date();
    }

    await strapi.db.query('api::garden-task.garden-task').update({
      where: { id: task.id },
      data: updateData
    });

    task.status = 'STARTED';
    task.started_at = updateData.started_at;
  }

  // Check if instruction is needed
  // We need to populate user's instructions to check if they've agreed
  const userWithInstructions = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { id: user.id },
    populate: ['instructions']
  });

  // Create a task object with the user's instructions for checkInstruction
  const taskForCheck = {
    ...task,
    volunteers: [userWithInstructions]
  };

  const needsInstruction = strapi.service('api::instruction.instruction').checkInstruction(taskForCheck);

  let instruction = false;
  const taskInstruction = task.instruction || task.recurring_task?.instruction;
  if (taskInstruction) {
    instruction = {
      id: taskInstruction.id,
      slug: taskInstruction.slug,
      url: strapi.service('api::instruction.instruction').getInstructionUrl(taskInstruction, user),
      needsAgreement: needsInstruction
    };
  }

  // Re-fetch task with updated data
  const updatedTask = await strapi.db.query('api::garden-task.garden-task').findOne({
    populate: ['volunteers', 'recurring_task', 'garden', 'primary_image'],
    where: { id: taskId }
  });

  const schema = strapi.getModel('api::garden-task.garden-task');
  const taskSanitized = await utils.sanitize.contentAPI.output(
    { data: { attributes: updatedTask } },
    schema
  );

  return {
    success: true,
    task: taskSanitized,
    instruction,
    isNewVolunteer: !isAlreadyVolunteer,
    statusUpdated: needsStatusUpdate
  };
};

module.exports = taskHelper;
