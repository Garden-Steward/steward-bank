'use strict';
const SmsHelper = require('./SmsHelper');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

const activeStatuses = ['STARTED', 'ISSUE', 'INTERESTED'];

/**
 * message controller
 */

module.exports = {
  // fetchSms: async (ctx, next) => {

  // If a user still has test@test.com we should request their email again, let them finish the registration flow.
  requestEmail: async (ctx, next) => {
    console.log(ctx.params.id);
    // const user = await strapi.service('plugin::users-permissions.user').findOne(ctx.params);
    const user = await strapi.entityService.findOne('plugin::users-permissions.user',ctx.params.id,
    { populate: ['activeGarden'] });
    
    let smsBody = null
    if (user.email == "test@test.com") {
      smsBody = `Hi! It's the Garden Steward bot :D you signed up for ${user.activeGarden.title} but haven't finished registering. Could you kindly respond with your email? Thank you!`
    }
    strapi.service('api::sms.sms').handleSms({
      task: null, 
      body: smsBody,
      type: 'followup',
      previous: null,
      user
  });

    return {message: smsBody, status: 'success'}

  },

  fetchSms: async ({request}) => {
    
    if (process.env.ENVIRONMENT == 'test') {
      request = {'body':{
        'From': '+13038833330',
        'Body': 'yes'
      }};
    }
    const phoneNumber = request.body.From;
    let responseText = request.body.Body.toLowerCase().trim();

    console.log('Incoming from: ', phoneNumber);
    const twiml = new MessagingResponse();

    let smsBody = '';
    let smsType = 'reply';
    // let garden = null;
    let smsInfo = null;
    let smsTask = null;

    const user = await SmsHelper.getUser( phoneNumber );
    const garden = await SmsHelper.checkGarden( responseText );
    const email = SmsHelper.checkEmail( user, responseText );
    responseText = SmsHelper.simplifySms( responseText, garden );

    console.log("responseText: ", responseText);

    switch (responseText) {

      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
      case '10':
        // eslint-disable-next-line no-case-declarations
        smsInfo = await SmsHelper.transferTask(user, responseText);
        break;

      case 'yes':
        smsInfo = await SmsHelper.handleYesResponse(responseText, user);
        break;

      case 'garden':
        smsInfo = await SmsHelper.joinGarden(user, phoneNumber, garden);
        break;

      case 'water schedule':
        smsInfo = await SmsHelper.waterSchedule(user);
        break;

      case 'skip':
        smsInfo = await strapi.service('api::garden-task.garden-task').skipTask(user);
        break;
      
      case 'no':
        smsInfo = await SmsHelper.findBackupUsers(user);
        break;
          
      case 'stop':
        await strapi.service('api::garden.garden').unsubscribeUser(user);
        smsBody = null;
        break;

      case 'start':
        smsBody = "Welcome back! You have been removed from all you gardens so please message their names to rejoin."
      break;
          
      case 'bot':
        smsBody = "I appreciate your enthusiasm in chat, but I'm just the Garden Steward bot..."
        break;

      case 'smiles':
        smsBody = "You\'re cute, but I'm just a bot ;)"
        break;

      case 'task':
        smsInfo = await strapi.service('api::garden-task.garden-task').getTaskFromSMS(user);
        break;
      
      case 'finished':
      case 'done':
        smsInfo = await SmsHelper.finishTask(user);
        break;

      case 'options':
        smsBody = await SmsHelper.getHelp(user);
        break;

      case 'vacation':
      case 'back':
        smsInfo = await SmsHelper.applyVacation(user);
        break;

      default: 
        smsBody = 'I don\'t understand. You can always try OPTIONS to find out more things to do with our service.';
        break;
    }
    
    // ** Volunteer Sign Up Flow ** /
    if (email) {
      console.log("email: ", email)
      try {
        smsInfo = await SmsHelper.saveVolunteerEmail(user, responseText);
      } catch (err) {
        console.log(err);
      }
    } else if (user && user.phoneNumber == user.username) {
      if (responseText == 'bot' || responseText == 'smiles') {
        smsBody = "I'm a bot btw! Can you tell me your name?";
      } else {
        smsInfo = await SmsHelper.saveVolunteerName(user, responseText);
      }
    }
    if (smsInfo) {
      smsBody = smsInfo.body;
      smsType = smsInfo.type;
      smsTask = smsInfo.task;
    }
    if (!user && smsType == 'registration') {
      SmsHelper.sendContactCard(phoneNumber);
    }
    // ** END Volunteer Sign Up Flow ** /
    console.log("sending: ", smsBody);
    if (smsBody) {
      twiml.message(smsBody);
  
      await SmsHelper.saveMessage(user,smsType, garden, smsBody, smsTask, request.body.Body);
    }

    return twiml.toString();
  },
  
    // try {
    //   ctx.body = 'ok';
    // } catch (err) {
    //   ctx.body = err;
    // }
};
