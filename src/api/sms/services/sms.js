const VoiceResponse = require('twilio').twiml.VoiceResponse;

let sendSms = function(toNum,body){
  const accountSid = process.env.TWILIO_ACCOUNT_SID ;
  const authToken = process.env.TWILIO_AUTH_TOKEN  ;
  const twilioNum =process.env.TWILIONUM;
  const client = require('twilio')(accountSid, authToken);
  console.log('sending sms to: ', toNum);
  client.messages
    .create({
      body: body,
      from: twilioNum, //the phone number provided by Twillio
      to: toNum // your own phone number
    })
    .then(message => console.log('SMS sid: ', message.sid));
};

/** Handle a Task Based SMS or pass in user */
let handleSms = function(task,body,type, previous, user){
  console.log("sms out: ", body, process.env.ENVIRONMENT);
  if (process.env.ENVIRONMENT == 'test') { return }
  let member = (task) ? task.volunteers[0] : user
    
  try {
    strapi.db.query('api::message.message').create({
      data: {
        user:member,
        type,
        garden: task?.garden || user.activeGarden,
        body,
        garden_task: task,
        previous
      }
    });
  } catch(err) {
    console.error('Problem logging message. ', err);
  }

  sendSms(member.phoneNumber, body);
};

const handleVoice = function(){
  const response = new VoiceResponse();
  response.say({
    voice: 'Polly.Joanna'
  },'Hello! You\'ve reached Garden Steward. Please send this number a text message if you\'d like to join as a volunteer. Thanks for calling, and feel free to stay on the line and dig this classic tune.');
  response.play('https://demo.twilio.com/docs/classic.mp3');
  return response.toString();
};
  

module.exports = {
  sendSms,
  handleSms,
  handleVoice
};