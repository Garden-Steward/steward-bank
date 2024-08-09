const instructionHelper = require('../../src/api/instruction/controllers/helper');


describe('approve of the instruction', function() {
  it('should fail if the phone number is not in the database', function() {

    strapi.db.query('plugin::users-permissions.user').findOne = jest.fn().mockReturnValue({
      createdAt: '2024-05-27T15:37:00.075Z',
      id: 207,
      phoneNumber: '+13038833330',
      firstName: 'Cameron',
      lastName: 'Tester',
      updatedAt: '2024-05-27T15:37:00.075Z',
    });
    const instruction = {
      id: 1,
      title: "Test Instruction",
      description: "This is a test instruction"
    }
    const phoneNumber = "+1234567890";

    instructionHelper.requestApproval({phoneNumber, instruction}).then(res=>{
      // console.log("schedule: ", res);
      expect(res.success).toBe(false);
    });
  });

  it('should not succeed if the phone number is in the database', function() {
    const instruction = {
      id: 1,
      title: "Test Instruction",
      description: "This is a test instruction"
    }
    const phoneNumber = "+130388333123";
    instructionHelper.requestApproval({phoneNumber, instruction}).then(res=>{
      // console.log("schedule: ", res);
      expect(res.success).toBe(false);
      
    });

  });

  it('should  succeed if the phone number is in the database', async function() {
    const instruction = {
      id: 1,
      title: "Test Instruction",
      description: "This is a test instruction",
      affirm_button_title: "Approve",
      deny_button_title: "Deny"
    }

    const phoneNumber = "3038833330";
    instructionHelper.requestApproval({phoneNumber, instruction}).then(res=>{
      expect(res.success).toBe(true);
    });
  });

  it('should approveInstruction', function() {
    const user = {
      id: 207,
      phoneNumber: "+13038833330",
      firstName: "Cameron",
      lastName: "Tester",
      instructions: [1]
    }
    const waterTask = {
      volunteers: [{firstName: "Cameron", phoneNumber: "+13038833330", username: "Cameron P"}]
    };
    const instruction = {
      id: 1,
      title: "Test Instruction",
      slug: "test-instruction"
    };
    strapi.service('api::instruction.instruction').InstructionAssignTask = jest.fn().mockResolvedValue({
      success: true,
      message: 'Sent water reminder for Cameron', 
      task: waterTask
    });


    instructionHelper.approveInstruction({user, instruction}).then(res=>{
      expect(res.success).toBe(true);
      expect(res.body).toContain("now ready for you");
    });
  });

});

