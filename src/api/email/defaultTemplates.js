'use strict';

/**
 * Default email templates used as starting points for garden welcome emails.
 * Gardens can override these in the Strapi admin; a garden with no template
 * gets this one.
 * Supported placeholders: {{firstName}}, {{gardenName}}, {{senderName}}
 */

const WELCOME_EMAIL = {
  subject: 'Welcome to {{gardenName}}!',
  body: `<p>Hi {{firstName}},</p>

<p>Thanks so much for signing up to volunteer with <strong>{{gardenName}}</strong> — we're really excited to have you with us!</p>

<p>We look forward to seeing you at our next volunteer day. It's a great chance to get your hands dirty, meet some fellow gardeners, and make a real difference in the community.</p>

<p><strong>Got an idea? Pitch it.</strong> Garden Steward is more than volunteer days. If there's a project you'd love to make happen, whether it's at Gravity Garden or right on your own block, you can pitch it to us on <a href="https://steward.garden">steward.garden</a>. We're a growing community of people who like to get involved, and we'd love to help get your idea off the ground.</p>

<p>In the meantime, if you have any questions, ideas, or just want to say hi — please don't hesitate to reach out. We're always happy to hear from you.</p>

<p>See you in the garden!</p>

<p>
  Warm regards,<br/>
  {{senderName}}<br/>
  {{gardenName}}
</p>`,
};

module.exports = { WELCOME_EMAIL };
