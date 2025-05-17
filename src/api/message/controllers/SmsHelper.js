const SmsHelper = {};
const { addDays, differenceInDays } = require('date-fns');
const {utcToZonedTime,} = require("date-fns-tz");
const InstructionHelper = require('../../instruction/controllers/helper');

/***
 * Updates tasks like "yes" to find certain status Garden Tasks and update them.
 */
SmsHelper.handleYesResponse = async(smsText, user) => {
  if (!user) {
    return {body: "Sorry you have to be registered to use this service", type: "reply"}
  }
  let question = await strapi.service('api::message.message').validateQuestion(user);
  console.log("q: ", question.id);
  if (question) {
    if (question.meta_data?.instructionId) {
      console.log('approving instruction')
      return InstructionHelper.approveInstructionId({user, instructionId: question.meta_data?.instructionId, question});
    } else {
      return SmsHelper.handleGardenTask(smsText, user, question);
    }
  } 
  const lastCampaign = await strapi.service('api::sms-campaign.sms-campaign').getLatestCampaign(user, ['rsvp', 'volunteer-day']);
  const currentDate = new Date();
  const createdAtDate = new Date(lastCampaign?.createdAt);
  const daysDifference = differenceInDays(currentDate, createdAtDate);
  if (lastCampaign && daysDifference < 7) {
    return strapi.service('api::sms-campaign.sms-campaign').confirmSMSCampaign(user);
  }
  return {body: "Can't find anything for you to say yes to!? Sorry!", type: "reply"}
}

SmsHelper.handleGardenTask = async(smsText, user, question) => {
  try {
    console.log("updating task yes start")
    let data = {};
    let origStatus = '';
    if (smsText === 'yes') {
      data = {
        status: 'STARTED',
        started_at: new Date(new Date().getTime())
      }
      // origStatus = 'INITIALIZED'
      origStatus = {$in:['INITIALIZED','STARTED', 'PENDING']};
    }  
    let gardenTask = question.garden_task;
    if (!gardenTask) {
      gardenTask = await strapi.service('api::garden-task.garden-task').findTaskFromUser(user);
    }
    // Check if user is not already in volunteers array and add them if needed
    if (gardenTask && (!gardenTask.volunteers.some(v => v.id === user.id))) {
      await strapi.service('api::garden-task.garden-task').addUserToTask(gardenTask, user);
    }

    // The user has a task ready to be updated!
    if (gardenTask) {
      if (gardenTask.status == 'INITIALIZED' || gardenTask.status == 'PENDING') {
        await strapi.db.query('api::garden-task.garden-task').update({
          data,
          where: {
            id: gardenTask.id
          }
        });
        return {body: 'That\'s great! Let me know you\'re DONE :)', type:'reply', task: gardenTask}
      } else if (gardenTask.status == 'STARTED' && gardenTask.volunteers.some(v => v.id === user.id)) {
        return {body: 'Looks like you\'ve already started! Let me know with FINISHED once you\'re done :)', type:'reply', task: gardenTask}
      } else if (gardenTask.status == 'STARTED') {
        return {body: 'We\'ve added you to the group task! There may be others working on it right now. Let me know with FINISHED once you\'re done :)', type:'reply', task: gardenTask}
      } else {
        return {body: 'Unsure what to do with this task! :)', type:'reply', task: gardenTask}
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
  smsText = (smsText.startsWith('volunt')) ? (gardenSmsSlug = 'gravity') : smsText;
  smsText = (smsText.startsWith('grav')) ? (gardenSmsSlug = 'gravity') : smsText;
  smsText = (smsText.startsWith('ehsm')) ? (gardenSmsSlug = 'ehsm') : smsText;
  smsText = (smsText.startsWith('parkway')) ? (gardenSmsSlug = 'parkway') : smsText;
  smsText = (smsText.startsWith('smith')) ? (gardenSmsSlug = 'smith') : smsText;
  smsText = (smsText.startsWith('fm smith')) ? (gardenSmsSlug = 'smith') : smsText;
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
  // Don't simplify if it's 'correct'
  if (smsText.toLowerCase() === 'correct') {
    return smsText;
  }
  smsText = (smsText.startsWith('ye') || smsText.startsWith('yas')) ? 'yes' : smsText
  smsText = (smsText.startsWith(':')) ? 'smiles' : smsText
  smsText = (smsText.startsWith('emphasized') || smsText.startsWith('loved')|| smsText.startsWith('❤️')) ? 'bot' : smsText
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
      data: {
        phoneNumber, 
        username: phoneNumber, 
        email: 'test@test.com', 
        activeGarden: garden.id, 
        gardens: garden.id,
        provider: 'local'
      }
    });
    return {body: `Welcome to Garden Steward SMS App! So glad to hear you\'re interested in volunteering for ${garden.title}. To start could we have your email?`,type:'registration'};

  } else if (user.email == 'test@test.com') {
    return {body: 'Looks like we still need an email, what email would you like to be informed about volunteering?',type:'registration'};

  } else {
    if (garden) {
      user.activeGarden = garden.id;
      let existingGarden = user.gardens.find(g=> g.id == garden.id);
      if (!existingGarden) {
        // User is joining this garden for the first time
        user.gardens.push(garden.id);
        await strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data: user});
        let smsBody;
        if (garden.welcome_text) {
          smsBody = {body: `${garden.welcome_text} \n\nYou can STOP messages any time.`,type:'registration'};
        } else {
          smsBody = {body: `Thanks for signing up for ${garden.title}. You\'ll start to receive notification about volunteer days. \n\nYou can STOP messages any time.`,type:'registration'};
        }
        SmsHelper.sendContactCard(phoneNumber);
        return smsBody;
      }
      await strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data: user});
      return {body: `You\'ve successfully changed your active SMS project to ${garden.title}.`,type:'complete'};

    }
  }
  // We should show them upcoming volunteer events!
  // @TODO!!
  return {body: 'Looks like you\'re already a volunteer! You\'ll get the next volunteer day notification.',type:'reply'};
};

SmsHelper.saveVolunteerEmail = async(user, email) => {
  await strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data: {email}});
  
  // Add email to Mailchimp
  try {
    const mailchimp = require("@mailchimp/mailchimp_marketing");
    
    mailchimp.setConfig({
      apiKey: process.env.MAILCHIMP_API_KEY,
      server: process.env.MAILCHIMP_SERVER_PREFIX // e.g., "us14"
    });

    await mailchimp.lists.addListMember(process.env.MAILCHIMP_LIST_ID, {
      email_address: email,
      status: "subscribed",
      merge_fields: {
        FNAME: user.firstName || '',
        LNAME: user.lastName || ''
      }
    });
  } catch (err) {
    console.log('Error adding email to Mailchimp:', err);
  }
  
  return {body: 'Thank you! Only one more step before you\'re offical. Just respond with your full name.',type:'reply'};
};

SmsHelper.sendContactCard = async(phoneNumber) => {
  const resp = await strapi.service('api::sms.sms').sendContactCard(phoneNumber);
  return resp;
}

SmsHelper.saveVolunteerName = async(user, msgTxt) => {
  msgTxt = msgTxt.toLowerCase();
  const fullName = msgTxt.replace(/\b\w/g, s => s.toUpperCase());
  const nameArr = fullName.split(' ');
  let firstName = nameArr[0];
  let lastName = 'Unknown';
  if (nameArr.length > 1) {
    lastName = nameArr.splice(1).join(' ');
  }
  const userName = (lastName === 'Unknown') ? firstName : fullName;
  try {
    await strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data:{firstName, lastName, username: fullName}});
  } catch (err) {
    console.log(err);
    return {body: `Sorry we can't accept this name: ${fullName} - You could already be signed up.`, type:'reply'};
  }
  return {body: `Welcome to the team ${userName}! \n\nIf you haven't already, please click on and add my contact card, sent earlier.`, type:'complete'};
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
        status:{$in:['INITIALIZED', 'PENDING', 'STARTED']}
      }
    });

    if (tasks.length == 1 && tasks[0].status == 'PENDING') {
      let instructionUrl = strapi.service('api::instruction.instruction').getInstructionUrl(tasks[0].recurring_task.instruction, user);
      return `Hi ${user.firstName}. We are waiting on task ${tasks[0].title}. Please respond to the instruction: YES if you agree you can manage the task. NO will allow you to transfer the task to someone else. You will be resent this instruction each time until approval.\n\n ${instructionUrl}`;
    } else if (tasks.length == 1) {
      return `Hi ${user.firstName}, you have the task of "${tasks[0].title}" it is in status: ${tasks[0].status}. YES if you can do the task. NO if want to transfer. SKIP if it isn't needed. `;
    } else if (tasks.length) {
      return `Hi ${user.firstName}, you have ${tasks.length} open tasks. YES if you can do the task. NO if want to transfer. SKIP if it isn't needed. `;
    } else if (user.activeGarden) {
      return `Hi ${user.firstName}, you have no open tasks. Your current active garden is ${user.activeGarden.title}.\n\nTo restart the registration process, text REGISTER`;
    } else {
      return `Hi ${user.firstName}, you don't have an active garden. Reply with the garden name you'd like to join! To restart the registration process, text REGISTER`;
    }
    
  } catch (err) {
    return `Hi ${user.firstName}! You can ask to receive a task, and you can join new SMS Groups by texting us their name. More coming!`;
  }
};

SmsHelper.waterSchedule = async(user) => {
  if (!user.activeGarden) {
    return {body: `I'm sorry ${user.firstName}, you are not a part of any garden. Please join a garden to use this feature.`, type: 'reply'};
  }
  const tasks = await strapi.service('api::garden-task.garden-task').getTypeTasks(user.activeGarden, 'Water', 3);

  let resp = "Recent watering updates: \n"
  for (task of tasks) {
    const nameCopy = task.volunteers.map((v)=> {return `${v.firstName} ${v.lastName.charAt(0)}`}).join('& ');
    const dateReady = utcToZonedTime(new Date(task.updatedAt), 'America/Los_Angeles');
    resp += `${dateReady.toDateString().slice(0,10)} by ${nameCopy}: ${task.status}\n`
  }
  const recTask = await strapi.service('api::recurring-task.recurring-task').getTypeRecurringTask(user.activeGarden, 'Water', 1);
  const weeklySchedule = await strapi.service('api::weekly-schedule.weekly-schedule').getWeeklySchedule(recTask[0].id);
  if (!weeklySchedule) {
    return {body: `I'm sorry ${user.firstName}, there is no schedule for watering at ${user.activeGarden.title}.`, type: 'reply'};
  }
  const scheduleUsers = await strapi.service('api::weekly-schedule.weekly-schedule').getScheduleAssignees(weeklySchedule.assignees);

  console.log("Running waterSchedule request: ",weeklySchedule.Week)
  resp += `\nSchedule ${weeklySchedule.Week}: \n${scheduleUsers}`
  return {body: resp,type: 'reply'}
};

SmsHelper.getTypeSpecificMessage = (taskType) => {
  const typeMessages = {
    'Water': 'Your watering efforts keep our garden thriving! 💧',
    'Weeding': 'Thanks for keeping our garden clean and healthy! 🌿',
    'Planting': 'New life in the garden thanks to you! 🌱',
    'Harvest': 'The fruits of your labor are delicious! 🍅',
    'General': 'This garden wouldn\'t be the same without you! 🌸'
  };
  return typeMessages[taskType] || 'Your contribution makes our garden special! 🌻';
};

SmsHelper.getRandomSuccessMessage = (user, task) => {
  const firstParts = [
    `You rock ${user.firstName}!`,
    `Awesome job ${user.firstName}!`,
    `Fantastic work ${user.firstName}!`,
    `Way to go ${user.firstName}!`,
    `Excellent work ${user.firstName}!`,
    `Superb job ${user.firstName}!`,
    `Outstanding work ${user.firstName}!`,
    `Brilliant job ${user.firstName}!`,
    `Terrific work ${user.firstName}!`,
    `Incredible job ${user.firstName}!`
  ];
  const firstPart = firstParts[Math.floor(Math.random() * firstParts.length)];
  const secondPart = SmsHelper.getTypeSpecificMessage(task?.type);
  return `${firstPart} ${secondPart}`;
};

SmsHelper.finishTask = async(user) => {
  const gardenTaskService = strapi.db.query('api::garden-task.garden-task');
  console.log('finishing for ', user.email);
  const weekAgo = addDays(new Date(),-7)

  // TODO: Update status of task if complete_once is true on the garden task. Everyone gets the opportunity to complete it themselves
  // TODO: Add new switch trigger for "ready for next task" to trigger "READY/NEXT" to SMS in. Something more natural than DONE for these complete_once false tasks.
  // 
  // complete_once means the task is a one time task and doesn't need to be completed again. Other people can join anytime when this is false.
  // Once finished, it's complete for everyone.
  try {
    let startedGroupTask = await gardenTaskService.findOne({
      where: {
        status:{$eq:'STARTED'},
        complete_once: {$eq: false},
        started_at: {$gte: weekAgo},
        volunteers: {
          phoneNumber: user.phoneNumber
        }
      }
    })
    if (startedGroupTask) {
      
    }
    const task = await gardenTaskService.update({
      where: {
        status:{$eq:'STARTED'},
        complete_once: {$eq: true},
        started_at: {$gte: weekAgo},
        volunteers: {
          phoneNumber: user.phoneNumber
        }
      }, 
      data: {
        status: 'FINISHED',
        completed_at: new Date(new Date().getTime())
      }
    });
    return {
      body: `${SmsHelper.getRandomSuccessMessage(user, task)} \n\nYou can ask for another task by texting TASK`,
      type:'complete',
      task
    };
  } catch (err) {
    console.log("finish error: ", err);
    return {
      body:'Have you started a task to finish? We found nothing to finish!',
      type:'reply',
      task
    };
  }
};

SmsHelper.findBackupUsers = async(user) => {

  const latestQuestion = await strapi.service('api::message.message').validateQuestion(user);
  let task;
  if (!latestQuestion ) {
    task = await strapi.service('api::garden-task.garden-task').findTaskFromUser(user);
  } else {
    task = latestQuestion.garden_task;
  }

  // There are multiple watering day transfer texts to be aware of only one here:
  if (task || latestQuestion.body.indexOf('it\'s your watering day' > -1)) {
    if (!task) {
      task = latestQuestion.garden_task;
    }
    if (!task) {
      return {body: 'Looks like you don\'t have a task to manage. Tell Cameron if it\s unexpected.', type: 'reply'};
    }
    if (!task.recurring_task) {
      return {body: 'Sorry this isn\'t a task that can be transferred. Only Scheduled Tasks can transfer.', type: 'reply', task, success: false};
    }

    const scheduler = await SmsHelper.getSchedulerFromTask(task);
    let smsExtra = '';
    let backupVolunteers = await SmsHelper.getBackupVolunteers(user, scheduler);
    if (backupVolunteers?.length) {
      let smsBody = 'We found some help for you. Respond with ';
      for (const idx in backupVolunteers) {
        let num = parseInt(idx) + 1;
        smsExtra = `${smsExtra} ${num} for ${backupVolunteers[idx].firstName},`;
      }
      smsBody = smsBody + smsExtra.slice(0,smsExtra.length-1) + '. Once you do we will transfer the task to them.';
      return {body: smsBody, task, type: 'followup'};
    } else if (!scheduler) {
      return {body: `There is no schedule today for ${task.title}`, type: 'reply', task};
    } else {
      return {body: 'There are no backup volunteers set for this task yet. You\'re on your own to find some help!', type: 'reply', task};
    }
  }
};

SmsHelper.applyVacation = async(user) => {
  try {
    const currentState = user.paused; // Assuming 'paused' is a boolean attribute of user
    await strapi.db.query("plugin::users-permissions.user").update({
      where: { id: user.id },
      data: { paused: !currentState } // Toggle the paused state
    });

    if (currentState) {
      return { body: `Welcome back ${user.firstName}! Your account is now active again.`, type: 'reply' };
    } else {
      return { body: `Hi ${user.firstName}, your account is now paused. Enjoy your vacation!\n\nJust let us know when you're BACK from VACATION (either will activate you again to tasks)`, type: 'reply' };
    }
  } catch (err) {
    console.error('Error updating user account: ', err);
    return { body: 'Sorry, there was an issue updating your account.', type: 'reply' };
  }
};

SmsHelper.getBackupVolunteer = (currentUser, scheduler, backUpNumber) => {
  const backupVolunteers = SmsHelper.getBackupVolunteers(currentUser, scheduler);
  if (!backupVolunteers) {
    return null;
  }
  return backupVolunteers[backUpNumber - 1];
}

SmsHelper.getBackupVolunteers = (currentUser, scheduler) => {
  if (!scheduler || !scheduler.backup_volunteers || scheduler.backup_volunteers.length === 0) {
    return null;
  }
  // Filter out paused volunteers
  let activeVolunteers = scheduler.backup_volunteers.filter(volunteer => !volunteer.paused);
  // Filter out the current user
  activeVolunteers = activeVolunteers.filter(volunteer => volunteer.id !== currentUser.id);

  return activeVolunteers;
};


SmsHelper.transferTask = async(user, backUpNumber) => {

  const latestQuestion = await strapi.service('api::message.message').validateQuestion(user);
  // TODO: If no question, check for a task.
  if (!latestQuestion ) {
    return {body:`I\'m sorry ${user.firstName}, we don\'t have an open task for you right now.`,type:'reply'};
  }
  // console.log('latestQuestion: ', latestQuestion)
  const task = latestQuestion.garden_task;
  if (!task) {
    return {body:'You don\'t have a task to transfer right now',type:'reply'};
  }
  if (!task.recurring_task) {
    return {body:'Sorry this isn\'t a task that can be transferred. Only Recurring Tasks can transfer.',type:'reply'};
  }
  const scheduler = await SmsHelper.getSchedulerFromTask(task);
  
  let newUser = SmsHelper.getBackupVolunteer(user, scheduler, backUpNumber);
  if (newUser) {
    let updatedTask;
    try {
      updatedTask = await strapi.service('api::garden-task.garden-task').updateGardenTaskUser(task, 'INITIALIZED', newUser);
    } catch (err) {
      console.log('error updating task: ', err);
      return { body:'Technical error when transferring the task.',type:'reply', task: task};
    }
    // console.log('got updatedtask: ', updatedTask);
    let needsInstruction = strapi.service('api::instruction.instruction').checkInstruction(updatedTask);
    let smsNewGuy;
    try{
      if (!needsInstruction) {
        smsNewGuy = `Hello! ${user.firstName} just assigned you the task of ${task.title}. Reply with YES or NO if you can manage this today.`;
      } else {
        let instructionUrl = strapi.service('api::instruction.instruction').getInstructionUrl(updatedTask.recurring_task.instruction, newUser);
        await strapi.service('api::garden-task.garden-task').updateTaskStatus(task, 'PENDING');
        smsNewGuy = `Hello! ${user.firstName} just assigned you the task of ${task.title}. First you need to agree to the instructions, then reply with YES or NO if you can manage this today.\n\n${instructionUrl}`;
        
      }
      await strapi.service('api::sms.sms').handleSms({
        task: updatedTask, 
        body: smsNewGuy, 
        type: 'question',
        previous: latestQuestion.body,
        user: newUser
    });

      // return message to the initiater of transfer.
      const bodyExtra = needsInstruction ? ' They will first need to agree to the instructions.' : '';
      const smsBody = `Okay we've transferred to ${newUser.firstName}.${bodyExtra}`;
      return {body:smsBody,type:'complete', task: updatedTask};
      
    } catch(err) {
      console.log('Task not transferred: ', err);
      const bodyExtra = needsInstruction ? ' and instruction.' : '.';
      return { body:'There was an issue in transferring the task' + bodyExtra,type:'reply', task: task};
    }

  } else if (scheduler) {
    return {body:`Your open task, ${task.title} has no available backup volunteers`,type:'reply', task: task};    
  } else {
    return {body:'Something went wrong. Sorry!',type:'reply', task: task};
  }


};

SmsHelper.registerUser = async(user) => {
  if (!user) {
    return {body: "Sorry, we couldn't find your account. Please try joining a garden first.", type: "reply"};
  }

  if (user.email === 'test@test.com') {
    return {body: "Please provide your email address to complete registration.", type: "registration"};
  }

  // If user has a valid email, verify it's correct
  return {body: `yarn dIs ${user.email} your correct email address? Please respond with CORRECT to confirm or provide a new email address.`, type: "registration"};
};

module.exports = SmsHelper;