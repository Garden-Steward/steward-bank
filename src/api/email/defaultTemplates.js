'use strict';

/**
 * Default email templates used as starting points for garden welcome emails.
 * Gardens can override these in the Strapi admin.
 * Supported placeholders: {{firstName}}, {{gardenName}}, {{senderName}}
 */

const WELCOME_EMAIL = {
  subject: 'Welcome to {{gardenName}}!',
  body: `<p>Hi {{firstName}},</p>

<p>Thanks so much for signing up to volunteer with <strong>{{gardenName}}</strong> — we're really excited to have you with us!</p>

<p>We look forward to seeing you at our next volunteer day. It's a great chance to get your hands dirty, meet some fellow gardeners, and make a real difference in the community.</p>

<p>In the meantime, if you have any questions, ideas, or just want to say hi — please don't hesitate to reach out. We're always happy to hear from you.</p>

<p>See you in the garden!</p>

<p>
  Warm regards,<br/>
  {{senderName}}<br/>
  {{gardenName}}
</p>`,
};

module.exports = { WELCOME_EMAIL };
