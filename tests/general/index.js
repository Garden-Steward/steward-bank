
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
const testTask = require('../tasks/taskMock');


describe('Yes Response on SmsHelper', () => {

  it('should handle yes appopriately', async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      id: 331,
      body: 'Do you "Approve" of this instruction?',
      type: 'question',
      previous: 'yes',
      createdAt: '2024-06-16T03:46:01.476Z',
      updatedAt: '2024-06-16T03:48:06.526Z',
      publishedAt: null,
    
    });

    const smsText = 'yes';
    const user = {
      id: '123',
      phoneNumber: '+13038833330',
      firstName: 'John',
      lastName: 'Doe'
    }

    let result = await SmsHelper.handleYesResponse(smsText, user)
    console.log("handle yes: ", result);
    expect(result.body).toBe("No open tasks for you at the moment, but loving the enthusiasm!!");
  });


  it('should handle yes for instruction needs', async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      id: 331,
      body: 'Do you "Approve" of this instruction?',
      type: 'question',
      previous: 'yes',
      createdAt: '2024-06-16T03:46:01.476Z',
      updatedAt: '2024-06-16T03:48:06.526Z',
      publishedAt: null,
      meta_data: { instructionId: 123 },
    });
    strapi.service('api::sms.sms').handleSms = jest.fn().mockResolvedValue({
      success: true,
      message: 'Message sent',
    });
    strapi.db.query('api::instruction.instruction').findOne = jest.fn().mockResolvedValue({
      id: 123,
      title: 'Test Instruction',
      slug: 'test-instruction',
      affirm_button_title: 'Approve',
    });
    const smsText = 'yes';
    const user = {
      id: '123',
      phoneNumber: '+13038833330',
      firstName: 'John',
      lastName: 'Doe'
    }
    testTask.status = 'PENDING'
    testTask.volunteers = [user];
    strapi.service('api::garden-task.garden-task').getUserTasksByStatus = jest.fn().mockResolvedValue(
      [
        testTask
      ]
    );
    strapi.service('api::instruction.instruction').InstructionAssignTask = jest.fn().mockResolvedValue({
      success: true,
      message: 'Message sent',
    });
    
    let result = await SmsHelper.handleYesResponse(smsText, user)
    console.log("handling yes test: ", result);
    expect(result.type).toBe('complete');
  });
});

