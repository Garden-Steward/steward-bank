
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');


describe('SmsHelper', () => {
  it('should send a contact card', async () => {
    let testNumber = '+13038833330';
    let result = await SmsHelper.sendContactCard(testNumber);
    console.log(result);
    expect(result.to).toBe(testNumber);
  });
});

