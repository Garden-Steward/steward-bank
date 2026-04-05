'use strict';

const crypto = require('crypto');
const { normalizePhoneNumber } = require('../../../utils/phone');

/**
 * Phone number verification controller
 * Handles: phone lookup -> email verification -> password creation
 */

module.exports = {
  /**
   * POST /auth/phone-signup
   * Step 1: User enters phone number, system checks if it exists and sends verification email
   */
  async phoneSignup(ctx) {
    const { phoneNumber } = ctx.request.body;

    if (!phoneNumber) {
      return ctx.badRequest('Phone number is required');
    }

    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized.valid) {
      return ctx.badRequest(normalized.message);
    }

    try {
      const user = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { phoneNumber: { $eq: normalized.phoneNumber } }
      });

      if (!user || user.length === 0) {
        return ctx.notFound('Phone number not found in our system. Please contact support.');
      }

      const targetUser = user[0];

      // Generate verification token (valid for 1 hour)
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Store token in user record temporarily
      await strapi.entityService.update('plugin::users-permissions.user', targetUser.id, {
        data: {
          email_verification_token: verificationToken,
          email_verification_expires: tokenExpiry
        }
      });

      // Generate verification link
      const verificationLink = `${process.env.GARDENVUE_URL}/verify-email?token=${verificationToken}&userId=${targetUser.id}`;

      // Send verification email
      try {
        await strapi.plugins['email'].services.email.send({
          to: targetUser.email,
          from: process.env.SMTP_FROM || 'noreply@steward.garden',
          subject: 'Verify Your Email - Garden Steward',
          text: `Click the link to verify your email and set up your password: ${verificationLink}`,
          html: `
            <h2>Welcome to Garden Steward!</h2>
            <p>Click the link below to verify your email and create your password:</p>
            <a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 4px;">
              Verify Email & Set Password
            </a>
            <p>This link expires in 1 hour.</p>
          `
        });
      } catch (emailError) {
        strapi.log.error('Email send failed:', emailError);

        const resendErr = emailError.resendError;
        if (resendErr && (resendErr.name === 'validation_error' || resendErr.name === 'not_found')) {
          return ctx.badRequest('You signed up with an invalid email and can\'t register at this time');
        }

        return ctx.internalServerError('Failed to send verification email');
      }

      const maskedEmail = targetUser.email.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) =>
        first + '*'.repeat(middle.length) + domain
      );

      ctx.send({
        message: `Verification email sent to ${maskedEmail}. Check your inbox for the verification link.`,
        email: maskedEmail,
        userId: targetUser.id,
        success: true
      });

    } catch (err) {
      strapi.log.error('Phone signup error:', err);
      ctx.internalServerError('An error occurred during signup');
    }
  },

  /**
   * POST /auth/verify-email
   * Step 2: User clicks verification link, token is verified
   */
  async verifyEmail(ctx) {
    const { token, userId } = ctx.request.body;

    if (!token || !userId) {
      return ctx.badRequest('Token and userId are required');
    }

    try {
      const user = await strapi.entityService.findOne('plugin::users-permissions.user', userId);

      if (!user) {
        return ctx.notFound('User not found');
      }

      strapi.log.debug(`verifyEmail: userId=${userId}, stored_token=${user.email_verification_token}, incoming_token=${token}`);

      if (user.email_verification_token !== token) {
        return ctx.forbidden('Invalid verification token');
      }

      // Check expiry
      if (new Date() > new Date(user.email_verification_expires)) {
        return ctx.forbidden('Verification token has expired');
      }

      // Mark email as verified
      await strapi.entityService.update('plugin::users-permissions.user', userId, {
        data: {
          email_confirmed: true,
          email_verification_token: null,
          email_verification_expires: null
        }
      });

      ctx.send({
        message: 'Email verified successfully. Please set your password.',
        userId: userId,
        verified: true
      });

    } catch (err) {
      strapi.log.error('Email verification error:', err);
      ctx.internalServerError('An error occurred during verification');
    }
  },

  /**
   * POST /auth/set-password
   * Step 3: After email verification, user creates password and logs in
   */
  async setPassword(ctx) {
    const { userId, password, confirmPassword } = ctx.request.body;

    if (!userId || !password || !confirmPassword) {
      return ctx.badRequest('UserId, password, and confirm password are required');
    }

    if (password !== confirmPassword) {
      return ctx.badRequest('Passwords do not match');
    }

    if (password.length < 8) {
      return ctx.badRequest('Password must be at least 8 characters long');
    }

    try {
      const user = await strapi.entityService.findOne('plugin::users-permissions.user', userId);

      if (!user) {
        return ctx.notFound('User not found');
      }

      if (!user.email_confirmed) {
        return ctx.forbidden('Email must be verified before setting password');
      }

      const authenticatedRole = await strapi.db.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      });

      await strapi.entityService.update('plugin::users-permissions.user', userId, {
        data: {
          password,
          confirmed: true,
          role: authenticatedRole.id,
        }
      });

      ctx.send({
        message: 'Password set successfully. You can now log in.',
        success: true
      });

    } catch (err) {
      strapi.log.error('Set password error:', err);
      ctx.internalServerError('An error occurred while setting password');
    }
  }
};
