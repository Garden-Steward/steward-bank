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
let sendSms = function(toNum,body,mediaUrl){
  const client = require('twilio')(accountSid, authToken);
  console.log('sending sms to: ', toNum);
  if (process.env.ENVIRONMENT == 'test') { 
    console.log("Test Sending: \n\n", body, `to ${toNum}`);
    return 
  }
  const sendBody = {
    body: body,
    from: twilioNum,
    to: toNum
  }
  if (mediaUrl) {
    sendBody.mediaUrl = mediaUrl;
  }
  client.messages
    .create(sendBody)
    .then(message => console.log('SMS sid: ', message.sid));
};

/** Handle a Task Based SMS or pass in user */
let handleSms = async function(params){
  let {task, body, type, previous, user, meta_data, event} = params
  console.log("sms out: ", body, "env: ", process.env.ENVIRONMENT);

  let member = (!user && task && task.volunteers?.length) ? task.volunteers[0] : user
    
  try {
    await strapi.db.query('api::message.message').create({
      data: {
        user:member,
        type,
        garden: task?.garden || user?.activeGarden || event?.garden,
        body,
        garden_task: task,
        previous,
        meta_data
      }
    });
  } catch(err) {
    console.error('Problem logging message. ', err);
  }
  if (process.env.ENVIRONMENT == 'test') { return }
  let mediaUrl = task?.primary_image ? task.primary_image.url : null;
  console.log("mediaUrl: ", mediaUrl);
  sendSms(member.phoneNumber, body, mediaUrl);
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
