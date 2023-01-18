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

    request = {'body':{
      'From': '+13038833333',
      'Body': 'Cameron Von Bumpberbutt'
    }};
    const phoneNumber = request.body.From;
    const gardenTaskService = strapi.db.query('api::garden-task.garden-task');
    const responseText = request.body.Body.toLowerCase().trim();

    console.log('Incoming from: ', phoneNumber, request);
    const twiml = new MessagingResponse();
    let user = null;
    try {
      user = await strapi
        .query("plugin::users-permissions.user")
        .findOne({
          where:{
            phone_number: phoneNumber
          },
          populate: {
            gardens: true,
            activeGarden: true
          }
        });

    } catch(err) {
      console.log('err on user find by phone number: ', err);
    }

    // Acceptable non user flows:
    // saying "Volunteer" we ask them their email and save the user.
    // Giving us their email address we create a new user
    // responseText turns to "signup"
    let smsBody = '';
    let smsType = 'reply';
    let garden = null;
    let smsInfo = null;
    let email = false;
    if (user && user.email === 'test@test.com') {
      // eslint-disable-next-line no-useless-escape
      const emailValidation = new RegExp('[a-z0-9]+@[a-z]+\.[a-z]{2,3}');
      if (emailValidation.test(responseText)) {
        email = true;
      }
    }

    switch (responseText) {

      case '1':
      case '2':
      case '3':
        // eslint-disable-next-line no-case-declarations
        smsInfo = await SmsHelper.transferTask(user, responseText);
        break;

      case 'yes':
      case 'yep':
      case 'yah':
      case 'yeah':
        try {
          console.log("updating task yes start")

          garden = await gardenTaskService.update({
            data: {
              status: 'STARTED',
              started_at: new Date(new Date().getTime())
            },
            where: {
              status: 'INITIALIZED',
              type: 'Water',
              // volunteers: {
              //   phone_number: {
              //     $contains: phoneNumber
              //   },
              // }
            },
            // populate: { volunteers: true }
          }, {
          });
          
          smsBody = 'That\'s great! Let me know with FINISHED once you\'re done :)';
        } catch (err) {
          console.log(err);
          smsBody = 'Couldn\'t find anything?';
        }

        break;

      case 'volunteer':
        smsInfo = await SmsHelper.newVolunteer(user, phoneNumber);
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
    
    if (user && garden == null) {
      if (user.activeGarden == null) {
        garden = user.gardens[0];
      } else {
        garden = user.activeGarden;
      }
    }

    await SmsHelper.saveMessage(user,smsType, garden, smsBody, null, request.body.Body);

    return twiml.toString();
  },
  
    // try {
    //   ctx.body = 'ok';
    // } catch (err) {
    //   ctx.body = err;
    // }
};
