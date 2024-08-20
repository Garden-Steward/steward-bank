
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');


describe('SmsHelper', () => {
  // it('should send a contact card', async () => {
  //   let testNumber = '+13038833330';
  //   let result = await SmsHelper.sendContactCard(testNumber);
  //   console.log(result);
  //   expect(result.to).toBe(testNumber);
  // });
});

describe('User Registration', () => {
  it('should manage registration names properly', async () => {
    let responseTxt = 'john SMITH';
    let user = {
      id: 1,
      phone: '+13038833330',
    };
    let smsInfo = await SmsHelper.saveVolunteerName(user, responseTxt);
    expect(smsInfo.body).toContain('Welcome to the team John Smith');
    
    responseTxt = 'Madonna';
    smsInfo = await SmsHelper.saveVolunteerName(user, responseTxt);
    expect(smsInfo.body).toContain('Welcome to the team Madonna');
  });
});