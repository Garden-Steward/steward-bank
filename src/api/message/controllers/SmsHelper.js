const SmsHelper = {};
const { addDays } = require('date-fns');
const {utcToZonedTime,} = require("date-fns-tz");

/***
 * Updates tasks like "yes" to find certain status Garden Tasks and update them.
 */
SmsHelper.handleYesResponse = async(smsText, user) => {
  if (!user) {
    return {body: "Sorry you have to be registered to use this service", type: "reply"}
  }
  let question = await strapi.service('api::message.message').validateQuestion(user);
  if (question) {
    return SmsHelper.handleGardenTask(smsText,user);
  } else {
    return strapi.service('api::sms-campaign.sms-campaign').confirmSMSCampaign(user);
  }
}

SmsHelper.handleGardenTask = async(smsText, user) => {
  try {
    console.log("updating task yes start")
    let data = {};
    let origStatus = '';
    if (smsText == 'yes') {
      data = {
        status: 'STARTED',
        started_at: new Date(new Date().getTime())
      }
      // origStatus = 'INITIALIZED'
      origStatus = {$in:['INITIALIZED','STARTED']};
    }  

    const gardenTask = await strapi.db.query('api::garden-task.garden-task').findOne({
      where: {
        status: origStatus,
        volunteers: {
          phoneNumber: user.phoneNumber
        },
      },
      populate: {
        volunters : {
          where: {
            email: user.email
          }
        }
      }
    });

    // The user has a task ready to be updated!
    if (gardenTask) {
      if (gardenTask.status == 'INITIALIZED') {
        await strapi.db.query('api::garden-task.garden-task').update({
          data,
          where: {
            id: gardenTask.id
          }
        });
        return {body: 'That\'s great! Let me know with FINISHED once you\'re done :)', type:'reply', task: gardenTask}
      } else {
        return {body: 'Looks like you\'ve already started! Let me know with FINISHED once you\'re done :)', type:'reply', task: gardenTask}
      }
    } else {
      return {body: 'No open tasks for you at the moment, but loving the enthusiasm!!', type:'reply'}
    }
    
  } catch (err) {
    console.log(err);
    // smsBody = ;
    return {body: 'Couldn\'t find anything?', type:'reply'}
  }

}

SmsHelper.checkGarden = async( smsText ) => {
  let gardenSmsSlug = null
  smsText = (smsText.startsWith('elder')) ? (gardenSmsSlug = 'elder') : smsText;
  smsText = (smsText.startsWith('volunt')) ? (gardenSmsSlug = 'grav') : smsText;
  smsText = (smsText.startsWith('grav')) ? (gardenSmsSlug = 'grav') : smsText;
  smsText = (smsText.startsWith('eastlake')) ? (gardenSmsSlug = 'ehsm') : smsText;
  smsText = (smsText.startsWith('ehsm')) ? (gardenSmsSlug = 'ehsm') : smsText;
  if (gardenSmsSlug) {
    return strapi.db.query("api::garden.garden").findOne({where:{sms_slug: gardenSmsSlug}});
  } else {
    return false;
  }

}

SmsHelper.simplifySms = ( smsText, garden ) => {
  if (garden) {
    return 'garden'
  }
  smsText = (smsText.startsWith('ye')) ? 'yes' : smsText
  smsText = (smsText.startsWith(':')) ? 'smiles' : smsText
  smsText = (smsText.startsWith('emphasized')) ? 'bot' : smsText
  return smsText;
}
SmsHelper.checkEmail = ( user, smsText ) => {
  let email = false;
  if (user && user.email === 'test@test.com') {
    // eslint-disable-next-line no-useless-escape
    const emailValidation = new RegExp('[a-z0-9]+@[a-z]+\.[a-z]{2,3}');
    if (emailValidation.test(smsText)) {
      email = true;
    }
  }
  return email;
}

SmsHelper.getUser = async(phoneNumber)  => {

  try {
    return strapi
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
}

SmsHelper.joinGarden = async(user, phoneNumber, garden) => {
  console.log('new volunteer: ', phoneNumber);

  if (!user) {//.query("plugin::users-permissions.user")
    console.log('no user garden', garden.title);
    await strapi.db.query("plugin::users-permissions.user").create({ 
      data: {phoneNumber, username: phoneNumber, email: 'test@test.com', activeGarden: garden.id, gardens: garden.id}
    });
    return {body: `So glad to hear you\'re interested in volunteering for ${garden.title}. To start could we have your email?`,type:'question'};

  } else if (user.email == 'test@test.com') {
    return {body: 'Looks like we still need an email, what email would you like to be informed about volunteering?',type:'question'};

  } else {
    if (garden) {
      user.activeGarden = garden.id;
      let existingGarden = user.gardens.find(g=> g.id == garden.id);
      if (!existingGarden) {
        user.gardens.push(garden.id);
        await strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data: user});
        return {body: `Thanks for signing up for ${garden.title}. You\'ll start to receive notification about volunteer days.`,type:'complete'};
      }
      await strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data: user});
      return {body: `You\'ve successfully changed your active garden to ${garden.title}.`,type:'complete'};

    }
  }
  // We should show them upcoming volunteer events!
  // @TODO!!
  return {body: 'Looks like you\'re already a volunteer! You\'ll get the next volunteer day notification.',type:'reply'};
};

SmsHelper.saveVolunteerEmail = async(user, email) => {
  await strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data: {email}});
  return {body: 'Thank you! Only one more step before you\'re offical. Just respond with your full name.',type:'reply'};
};

SmsHelper.saveVolunteerName = async(user, fullName) => {
  const nameArr = fullName.split(' ');
  let firstName = nameArr[0];
  let lastName = 'Unknown';
  if (nameArr.length > 1) {
    lastName = nameArr.splice(1).join(' ');
  }
  try {
    await strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data:{firstName, lastName, username: fullName}});
  } catch (err) {
    console.log(err);
    return {body: `Sorry we can't accept this name: ${fullName} - You could already be signed up.`, type:'reply'};
  }
  return {body: `Welcome to the team ${fullName}`, type:'complete'};
};

SmsHelper.getSchedulerFromTask = async(task) => {
  const dayOfWeekName = new Date().toLocaleString(
    'default', {weekday: 'long'}
  );
  try {
    const taskSchedulers = await await strapi.entityService.findMany('api::scheduler.scheduler', {
      filters: {
        recurring_task: task.recurring_task.id
      },
      populate: ['backup_volunteers'],
    });

    for (const schedule of taskSchedulers) {
      console.log(schedule.day, dayOfWeekName);
      if (schedule.day == dayOfWeekName) {
        return schedule;
      }
    }
  } catch(err) {
    console.log('ERROR: could not find a scheduler: ', err);
  }
  return false;
};

SmsHelper.saveMessage = async(user, type, garden, body, garden_task, previous) => {
  console.log("garden task: ", garden_task)
  try {
    console.log(`saveMessage: saving ${type}`);
    await strapi.db.query('api::message.message').create({
      data: {
        user,
        type,
        garden,
        body,
        garden_task,
        previous
      }
    });
  } catch (err) {
    console.warn('Could not save message: ', err);
  }
};

SmsHelper.getHelp = async(user) => {
  const gardenTaskService = strapi.db.query('api::garden-task.garden-task');
  try {
    let tasks = await gardenTaskService.findMany({
      where: {
        volunteers: {
          phoneNumber: user.phoneNumber
        },
        status:{$in:['INITIALIZED']}
      }
    });
    return `Hi ${user.firstName}, you have ${tasks.length} open tasks. YES if you can do the task. NO if want to transfer. SKIP if it isn't needed. `;
  } catch (err) {
    return `Hi ${user.firstName}! You can ask to receive a task, and you can join new SMS Groups by texting us their name. More coming!`;
  }
};

SmsHelper.waterSchedule = async(user) => {
  const tasks = await strapi.service('api::garden-task.garden-task').getTypeTasks(user.activeGarden, 'Water', 3);

  let resp = "Recent watering updates: \n"
  for (task of tasks) {
    const nameCopy = task.volunteers.map((v)=> {return `${v.firstName} ${v.lastName.charAt(0)}`}).join('& ');
    const dateReady = utcToZonedTime(new Date(task.updatedAt), 'America/Los_Angeles');
    resp += `${dateReady.toDateString().slice(0,10)} by ${nameCopy}: ${task.status}\n`
  }
  const recTask = await strapi.service('api::recurring-task.recurring-task').getTypeRecurringTask(user.activeGarden, 'Water', 1);
  const weeklySchedule = await strapi.service('api::weekly-schedule.weekly-schedule').getWeeklySchedule(recTask[0].id);
  const scheduleUsers = await strapi.service('api::weekly-schedule.weekly-schedule').getScheduleAssignees(weeklySchedule.assignees);

  console.log("Running waterSchedule request: ",weeklySchedule.Week)
  resp += `\nSchedule ${weeklySchedule.Week}: ${scheduleUsers}`
  return {body: resp,type: 'reply'}
};

SmsHelper.finishTask = async(user) => {
  const gardenTaskService = strapi.db.query('api::garden-task.garden-task');
  console.log('finishing for ', user.email);
  const weekAgo = addDays(new Date(),-7)

  try {
    const task = await gardenTaskService.update({
      where: {
        status:{$eq:'STARTED'},
        started_at: {$gte: weekAgo},
        volunteers: {
          phoneNumber: user.phoneNumber
        },
        type: 'Water'
      }, 
      data: {
      status: 'FINISHED',
      completed_at: new Date(new Date().getTime())
      }
    });
    return {
      body:`You rock ${user.firstName}! We\'ve marked your watering day as done :)`,
      type:'complete'
    };
  } catch (err) {
    console.log("finish error: ", err);
    return {
      body:'Have you started a task to finish? We found nothing to finish!',
      type:'reply'
    };
  }
};

SmsHelper.skipTask = async(user) => {
  const gardenTaskService = strapi.db.query('api::garden-task.garden-task');
  let gardenTask;
  try {
    gardenTask = await gardenTaskService.update({
      where: {
        status:{$in:['INITIALIZED','STARTED']},
        volunteers: user,
        type: 'Water'
      }, 
      data: {
        status: 'SKIPPED',
        completed_at: new Date(new Date().getTime())
      }
    });
  } catch (err) {
    console.error('skip error: ', err);
  }
  return {body:'Alright then! Your task has been skipped!',type: 'complete',task: gardenTask};
};

SmsHelper.findBackupUsers = async(user) => {

  const latestQuestion = await strapi.service('api::message.message').validateQuestion(user);
  let task;
  if (!latestQuestion ) {
    let tasks = await strapi.service('api::garden-task.garden-task').getUserTasksByStatus(user,'INITIALIZED');
    if (!tasks.length) {
      return 'I\'m sorry, we don\'t have an open task for you right now.';
    } else {
      // return `The task "${tasks[0].title}" can\'t be transferred, sorry!`;
      task = tasks[0]
    }
  }
  if (task || latestQuestion.body.indexOf('it\'s your watering day' > -1)) {
    if (!task) {
      task = latestQuestion.garden_task;
    }
    if (!task) {
      return 'Looks like you don\'t have a task to manage.';
    }
    if (!task.recurring_task) {
      return 'Sorry this isn\'t a task that can be transferred. Only Recurring Tasks can transfer.';
    }
  
    const scheduler = await SmsHelper.getSchedulerFromTask(task);
    let smsExtra = '';
    if (scheduler && scheduler.backup_volunteers.length) {
      let smsBody = 'We found some help for you. Respond with ';
      for (const idx in scheduler.backup_volunteers) {
        let num = parseInt(idx) + 1;
        smsExtra = `${smsExtra} ${num} for ${scheduler.backup_volunteers[idx].firstName},`;
      }
      smsBody = smsBody + smsExtra.slice(0,smsExtra.length-1) + '. Once you do we will transfer the task to them.';
      return smsBody;
    } else if (!scheduler) {
      return `There is no schedule today for ${task.title}`;
    } else {
      return 'There are no backup volunteers set for this task yet. You\'re on your own to find some help!';
    }
  }
};

SmsHelper.sendSMS = (task, body, type) => {
  return strapi.service('api::sms.sms').handleSms(
    task, 
    body, 
    type
  );
};

SmsHelper.transferTask = async(user, backUpNumber) => {
  const latestQuestion = await strapi.service('api::message.message').validateQuestion(user);
  if (!latestQuestion ) {
    return {body:`I\'m sorry %{user.firstName}, we don\'t have an open task for you right now.`,type:'reply'};
  }
  const task = latestQuestion.garden_task;
  if (!task) {
    return {body:'You don\'t have a task to transfer right now',type:'reply'};
  }
  if (!task.recurring_task) {
    return {body:'Sorry this isn\'t a task that can be transferred. Only Recurring Tasks can transfer.',type:'reply'};
  }
  const scheduler = await SmsHelper.getSchedulerFromTask(task);
  if (scheduler && scheduler.backup_volunteers.length) {
    let newUser = scheduler.backup_volunteers[backUpNumber-1];
    try {
      let updatedTask = await strapi.service('api::garden-task.garden-task').updateGardenTask(task, 'INITIALIZED', newUser);
      const smsBody = `Okay we've transferred to ${newUser.firstName}`;
      const smsNewGuy = `Hello! ${user.firstName} just assigned you the task of ${task.title}. Reply with YES or NO if you can manage this today.`;
      SmsHelper.sendSMS(updatedTask, smsNewGuy, 'question');
      return {body:smsBody,type:'complete'};
    } catch(err) {
      console.log('Task not transferred: ', err);
      return {body:'There was an issue in transferring.',type:'reply'};
    }

  } else if (scheduler) {
    return {body:`Your open task, ${task.title} has no backup volunteers`,type:'reply'};    
  } else {
    return {body:'Something went wrong. Sorry!',type:'reply'};
  }


};

module.exports = SmsHelper;