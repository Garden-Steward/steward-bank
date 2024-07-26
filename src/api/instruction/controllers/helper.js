const instructionHelper = {}

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
    console.log('formattedPhoneNumber: ', formattedPhoneNumber)

  const user = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: {
      phoneNumber: formattedPhoneNumber
    }
  });
  console.log('got user: ', user)
  if (user) {
    // do not approve task
    // send text to user
    strapi.service('api::sms.sms').handleSms({
      task: null, 
      body: 
      `Hi ${user.firstName}, we received an instruction request from the Garden Steward website. \n\nDo you "${instruction.affirm_button_title}"? ${instruction.title}`,
      type: 'question',
      previous: null,
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