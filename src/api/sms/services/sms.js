const VoiceResponse = require('twilio').twiml.VoiceResponse;
const accountSid = process.env.TWILIO_ACCOUNT_SID ;
const authToken = process.env.TWILIO_AUTH_TOKEN  ;
const twilioNum =process.env.TWILIONUM;

let sendContactCard = function(toNum){
  const client = require('twilio')(accountSid, authToken);
  console.log('sending contact card to ', toNum);
  return client.messages
    .create({
      body: '',
      from: twilioNum,
      to: toNum,
      mediaUrl: `https://steward.garden/contactcard.vcf`
    });
}
let sendSms = function(toNum,body){
  const client = require('twilio')(accountSid, authToken);
  console.log('sending sms to: ', toNum);
  if (process.env.ENVIRONMENT == 'test') { 
    console.log("Sending: ", body, `to ${toNum}`);
    return 
  }
  client.messages
    .create({
      body: body,
      from: twilioNum,
      to: toNum
    })
    .then(message => console.log('SMS sid: ', message.sid));
};

/** Handle a Task Based SMS or pass in user */
let handleSms = function(params){
  let {task, body, type, previous, user} = params
  console.log("sms out: ", body, process.env.ENVIRONMENT);
  if (process.env.ENVIRONMENT == 'test') { return }

  let member = (!user && task && task.volunteers?.length) ? task.volunteers[0] : user
    
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
  handleVoice,
  sendContactCard
};
