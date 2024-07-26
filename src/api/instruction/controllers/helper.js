const instructionHelper = {}

instructionHelper.requestApproval = async (phoneNumber, instruction) => {
  // TODO: Text User - do they approve of the instruction? But only if they're a registered user tied to the garden.
  // Validate phone number using a simple regex for US phone numbers
  const phoneRegex = /^(\+1|1)?[-.\s]?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
  if (!phoneRegex.test(phoneNumber)) {
    return {
      success: false,
      message: 'Invalid US phone number format'
    };
  }
  const user = await strapi.db.query('api::weekly-schedule.weekly-schedule').findOne({
    where: {
      phoneNumber: phoneNumber
    }
  });
  if (user) {
    // do not approve task
    // send text to user
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

