const SmsHelper = {};

/**
 * 
 * @param {obj} garden 
 * @param {obj} user 
 * @returns A task object that contains a scheduler.
 */
// SmsHelper.getGardenTaskByUserAndGarden = async(garden,user) => {
//   // find the most relevant open task. This is for recurring tasks that have schedulers
//   const gardenTaskService = strapi.db.query('api::garden-task.garden-task');
//   try {
//     let opentasks = await gardenTaskService.findMany({
//       data: {_limit: 5, garden,user,status:{$in:['INITIALIZED','STARTED']}},
//       populate: {recurring_task: true, recurring_task.schedulers : true}
//     });
//     console.log(`found ${opentasks.length} tasks open for ${user.firstName}`);
//     opentasks = opentasks.sort((a,b) => Date.parse(new Date(b.updatedAt)) - Date.parse(new Date(a.updatedAt)));
//     for (let task of opentasks) {
//       if (task.recurringtask) {
//         return task;
//       }
//     }
//   } catch(err) {
//     console.log('getGardenTaskByUserAndGarden ERROR: bad user or garden: ', err);
//   }
// };

SmsHelper.newVolunteer = async(user, phoneNumber) => {
  console.log('new volunteer: ', phoneNumber);
  if (!user) {//.query("plugin::users-permissions.user")
    await strapi.db.query("plugin::users-permissions.user").create({ 
      data: {phoneNumber, username: phoneNumber, email: 'test@test.com'}
    });
    return {body: 'So glad to hear you\'re interested in volunteering for the Gravity Garden. To start could we have your email?',type:'question'};
  } else if (user.email == 'test@test.com') {
    return {body: 'Looks like we still need an email, what email would you like to be informed about volunteering?',type:'question'};
  }
  
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

SmsHelper.updateGardenTask = async(task, status, user) => {
    
  return strapi.db.query('api::garden-task.garden-task').update({
    where: {
      id: task.id
    }, 
    data: {
      status,
      volunteers: user
    }
  });
};

SmsHelper.getSchedulerFromTask = async(task) => {
  const schedulerService = strapi.api.scheduler.services.scheduler;
  const dayOfWeekName = new Date().toLocaleString(
    'default', {weekday: 'long'}
  );
  try {
    const taskSchedulers = await schedulerService.find({recurringtask:task.recurringtask},['backup_users']);

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

SmsHelper.validateQuestion = async(user) => {
  const messageService = strapi.api.messages.services.messages;
  const latestMessage = await messageService.findOne({_sort: 'updatedAt:desc', user, type: {$in:['question','complete']}},['gardentask']);
  if (latestMessage.type=='question') {
    return latestMessage;
  } else { // type == complete
    // the user completed the last open question.
    return false;
  }
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
  let tasks = await gardenTaskService.findMany({
    where: {
      volunteers: user,
      status:{$in:['INITIALIZED']}
    }
  });
  return `Hi ${user.firstName}, you have ${tasks.length} open tasks. YES if you can do the task. NO if want to transfer. SKIP if it isn't needed. `;
};

SmsHelper.finishTask = async(user) => {
  const gardenTaskService = strapi.db.query('api::garden-task.garden-task');
  console.log('done');
  try {
    await gardenTaskService.update({
      where: {
        status:{$eq:'STARTED'},
        volunteers: user,
        type: 'Water'
      }, 
      data: {
      status: 'FINISHED',
      completed_at: new Date(new Date().getTime())
      }
    });
    return {
      body:'You rock! We\'ve marked your watering day as done :)',
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
  try {
    await gardenTaskService.update({
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
  return 'Alright then! Your task has been skipped!';
};

SmsHelper.findBackupUsers = async(user) => {

  const latestQuestion = await SmsHelper.validateQuestion(user);
  if (!latestQuestion ) {
    return 'I\'m sorry, we don\'t have an open task for you right now.';
  }

  if (latestQuestion.body.indexOf('Reply YES if you\'re able to water today' > -1)) {
    const task = latestQuestion.garden_task;
    if (!task) {
      return 'Looks like you don\'t have a task to manage.';
    }
    const scheduler = await SmsHelper.getSchedulerFromTask(task);
    let smsExtra = '';
    if (scheduler && scheduler.backup_users.length) {
      let smsBody = 'We found some help for you. Respond with ';
      for (const idx in scheduler.backup_users) {
        let num = parseInt(idx) + 1;
        smsExtra = `${smsExtra} ${num} for ${scheduler.backup_users[idx].firstName},`;
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
  const latestQuestion = await SmsHelper.validateQuestion(user);
  if (!latestQuestion ) {
    return {body:'I\'m sorry, we don\'t have an open task for you right now.',type:'reply'};
  }
  const task = latestQuestion.garden_task;
  if (!task) {
    return {body:'You don\'t have a task to transfer right now',type:'reply'};
  }
  const scheduler = await SmsHelper.getSchedulerFromTask(task);
  if (scheduler && scheduler.backup_users.length) {
    let newUser = scheduler.backup_users[backUpNumber-1];
    try {
      let updatedTask = await SmsHelper.updateGardenTask(task, 'INITIALIZED', newUser);
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