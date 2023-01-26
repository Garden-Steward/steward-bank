'use strict';
const SmsHelper = require('./SmsHelper');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

const activeStatuses = ['STARTED', 'ISSUE', 'INTERESTED'];

/**
 * message controller
 */

module.exports = {
  // fetchSms: async (ctx, next) => {
  fetchSms: async ({request}) => {

    // request = {'body':{
    //   'From': '+13038833330',
    //   'Body': 'gravity'
    // }};
    const phoneNumber = request.body.From;
    let responseText = request.body.Body.toLowerCase().trim();

    console.log('Incoming from: ', phoneNumber);
    const twiml = new MessagingResponse();

    let smsBody = '';
    let smsType = 'reply';
    // let garden = null;
    let smsInfo = null;

    const user = await SmsHelper.getUser( phoneNumber );
    const garden = await SmsHelper.checkGarden( responseText );
    const email = SmsHelper.checkEmail( user, responseText );
    responseText = SmsHelper.simplifySms( responseText, garden );

    switch (responseText) {

      case '1':
      case '2':
      case '3':
        // eslint-disable-next-line no-case-declarations
        smsInfo = await SmsHelper.transferTask(user, responseText);
        break;

      case 'yes':
        smsInfo = await SmsHelper.handleGardenTask(responseText, user);
        break;

      case 'garden':
        smsInfo = await SmsHelper.joinGarden(user, phoneNumber, garden);
        break;

      case 'skip':
        smsBody = await SmsHelper.skipTask(user);
        smsType = 'complete';
        break;

      case 'no':
        smsBody = await SmsHelper.findBackupUsers(user);
        break;
      
      case 'finished':
      case 'done':
        smsInfo = await SmsHelper.finishTask(user);
        break;

      case 'options':
        smsBody = await SmsHelper.getHelp(user);
        break;
  
      default: 
        smsBody = 'I don\'t understand. Please respond with YES or NO, or if you already said yes let me know when you\'re FINISHED';
        break;
    }
    console.log("email: ", email)

    // ** Volunteer Sign Up Flow ** /
    if (email) {
      try {
        smsInfo = await SmsHelper.saveVolunteerEmail(user, responseText);
      } catch (err) {
        console.log(err);
      }
    } else if (user && user.phoneNumber == user.username) {
      const fullName = responseText.replace(/\b\w/g, s => s.toUpperCase());
      smsInfo = await SmsHelper.saveVolunteerName(user, fullName);
    }
    // ** END Volunteer Sign Up Flow ** /

    if (smsInfo) {
      smsBody = smsInfo.body;
      smsType = smsInfo.type;
    }

    twiml.message(smsBody);

    await SmsHelper.saveMessage(user,smsType, garden, smsBody, null, request.body.Body);

    return twiml.toString();
  },
  
    // try {
    //   ctx.body = 'ok';
    // } catch (err) {
    //   ctx.body = err;
    // }
};
