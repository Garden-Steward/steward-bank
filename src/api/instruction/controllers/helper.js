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
  console.log('approving instruction', instruction)
  try {
    await strapi.entityService.update('plugin::users-permissions.user', user.id, {
      data: {"instructions" : {"connect": [instruction.id]}}
    });

    const {success, message} =  await strapi.service('api::instruction.instruction').InstructionAssignTask(instruction, user);
    console.log("instruction assign task result: ", success, message);
    if (success) {
      return {body: `Thank You!!! You're now qualified to handle ${instruction.title}!`, type: "complete", success: true};
    } else {
      return {body: `Error approving instruction: ${message}`, type: "error", success: false};
    }

  } catch (err) { 
    console.warn(err);
    return {body: `Technical Error approving instruction: ${err.message}`, type: "error", success: false};
  }
  
  
}


instructionHelper.approveInstructionId = async ({ user, instructionId, question }) => {
  console.log("TACO TACO id ", instructionId);
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

instructionHelper.requestApproval = async ({ phoneNumber, instruction }) => {
  // Ensure phoneNumber is a string
  let cleanedNumber = `${phoneNumber}`;

  // Remove any non-digit characters from the phone number
  cleanedNumber = cleanedNumber.replace(/[^\d]/g, '');

  // Validate phone number using a regex for 10-digit or 11-digit (with country code) US phone numbers
  const phoneRegex = /^(1?[2-9]\d{9})$/;
  if (!phoneRegex.test(cleanedNumber)) {
    return {
      success: false,
      message: 'Invalid US phone number format. Please provide a 10-digit number with or without the country code.'
    };
  }

  // Format the phone number to include country code without hyphens
  const formattedPhoneNumber = cleanedNumber.length === 10
    ? `+1${cleanedNumber}`
    : `+${cleanedNumber}`;

  const user = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: {
      phoneNumber: formattedPhoneNumber
    }
  });

  if (user) {
    // do not approve task
    // send text to user
    strapi.service('api::sms.sms').handleSms({
      task: null, 
      body: 
      `Hi ${user.firstName}, we received an instruction request from the Garden Steward website. \n\nDo you "${instruction.affirm_button_title}"? ${instruction.title}`,
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
      message: "User not found with the provided phone number"
    };
  }
  // do not approve task
  // return;
}

module.exports = instructionHelper;