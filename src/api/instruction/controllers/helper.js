const { normalizePhoneNumber } = require('../../../utils/phone');

const instructionHelper = {}

/**
 * APPROVE INSTRUCTION 
 * adds the passed in instruction onto the user and notifies them
 * Also inits sending of task back to user
 * @param {object} user 
 * @param {object} instruction 
 * @param {object} question 
 * @returns 
 */
instructionHelper.approveInstruction = async ({ user, instruction, question }) => {

  try {
    await strapi.entityService.update('plugin::users-permissions.user', user.id, {
      data: {"instructions" : {"connect": [instruction.id]}}
    });
  } catch (err) {
    console.warn(err);
    return {body: `Technical Error updating user instructions: ${err.message}`, type: "error", success: false};
  }
  try {

    const {success, message, task} =  await strapi.service('api::instruction.instruction').InstructionAssignTask(instruction, user);

    if (success) {
      if (task) {
        // Update the task to be back to 'INITIALIZED'
        await strapi.service('api::garden-task.garden-task').updateTaskStatus(task, 'INITIALIZED');
        return {body: `Thank You!!! You're now qualified to handle "${instruction.title}"! Task: "${task.title}" now ready for you.`, type: "followup", success: true, task};
      } else {
        return {body: `Thank You!!! You're now qualified to handle "${instruction.title}"! You currently don't have this task assigned.`, type: "followup", success: true};
      }
    } else {
      return {body: `Error approving instruction: ${message}`, type: "error", success: false};
    }

  } catch (err) { 
    // console.warn(err);
    return {body: `Technical Error approving instruction: ${err.message}`, type: "error", success: false};
  }
  
  
}


instructionHelper.approveInstructionId = async ({ user, instructionId, question }) => {
  try {
    let instruction = await strapi.db.query('api::instruction.instruction').findOne({
      where: {
        id: instructionId
      }
    });
    return instructionHelper.approveInstruction({user, instruction, question});
  } catch (err) {
    console.warn(err);
    return {success: false, message: "Error approving instruction"};
  }
}

instructionHelper.requestApproval = async ({ phoneNumber, userId, instruction }) => {
  // Ensure phoneNumber is a string
  let user;
  if (phoneNumber) {
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized.valid) {
      return { success: false, message: normalized.message };
    }

    user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: {
        phoneNumber: normalized.phoneNumber
      }
    });
  } else if (userId) {
    user = await strapi.entityService.findOne('plugin::users-permissions.user', userId);
  }

  if (user) {
    const gardenTask = await strapi.service('api::garden-task.garden-task').findTaskFromUser(user);
    // send text to user
    strapi.service('api::sms.sms').handleSms({
      task: gardenTask, 
      body: 
      `Hi ${user.firstName}, we received an instruction request from the Garden Steward website. \n\nDo you ${instruction.affirm_button_title} ${instruction.title}? You can reply with YES or NO`,
      type: 'question',
      previous: 'Phone Number submission via Garden Steward',
      user,
      meta_data: {
        instructionId: instruction.id
      }
    });
    return {
      success: true,
      message: "User found with the provided phone number"
    };

  } else {
    return {
      success: false,
      message: "User not found with the phone number or userId"
    };
  }
  // do not approve task
  // return;
}

module.exports = instructionHelper;