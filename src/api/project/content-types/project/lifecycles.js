'use strict';

const crypto = require('crypto');

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    if (!data.verification_token) {
      data.verification_token = crypto.randomUUID();
    }
  },

  async afterCreate(event) {
    const { data } = event.params;
    const email = data.submitter_email;

    if (!email) {
      // Unauthenticated pitch or no email — skip verification email
      return;
    }

    const token = data.verification_token;
    if (!token) {
      return;
    }

    const verifyUrl = `https://steward.garden/api/projects/verify?token=${token}`;

    try {
      await strapi.plugins['email'].services.email.send({
        to: email,
        from: 'noreply@steward.garden',
        subject: 'Verify your Garden Steward project',
        html: `
          <p>Thanks for submitting your project to Garden Steward!</p>
          <p>Please verify your email by clicking the link below:</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>If you did not submit this project, you can ignore this email.</p>
        `,
      });
    } catch (err) {
      strapi.log.error('Failed to send verification email:', err);
    }
  },
};