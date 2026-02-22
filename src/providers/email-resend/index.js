'use strict';

const { Resend } = require('resend');

module.exports = {
  init(providerOptions, settings) {
    const resend = new Resend(providerOptions.apiKey);

    return {
      async send(options) {
        const from = options.from || settings.defaultFrom;
        const replyTo = options.replyTo || settings.defaultReplyTo;

        const payload = {
          from,
          to: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
          text: options.text,
          html: options.html,
        };

        if (replyTo) {
          payload.replyTo = replyTo;
        }

        if (options.cc) {
          payload.cc = Array.isArray(options.cc) ? options.cc : [options.cc];
        }

        if (options.bcc) {
          payload.bcc = Array.isArray(options.bcc) ? options.bcc : [options.bcc];
        }

        const { data, error } = await resend.emails.send(payload);

        if (error) {
          const err = new Error(`Resend email error: ${error.message}`);
          err.resendError = error;
          throw err;
        }

        return data;
      },
    };
  },
};
