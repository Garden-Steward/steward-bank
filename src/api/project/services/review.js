'use strict';

/**
 * Project review decisions: approve / request changes / deny, an undo window,
 * and the pitcher emails that wait for that window to close.
 *
 * Decisions are stored on the project itself (review_* fields). The pitcher
 * email is not sent at decision time: `review_notify_after` is set to the end
 * of the undo window and the `sendProjectReviewNotifications` cron sends it
 * after that. Undo clears `review_notify_after`, so nothing goes out.
 */

const FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@steward.garden';
const SITE_URL = 'https://steward.garden';

const UNDO_WINDOW_MS = 10 * 60 * 1000;

const DECISIONS = {
  approve: 'APPROVED',
  request_changes: 'CHANGES_REQUESTED',
  deny: 'REJECTED',
};

// Stored as codes so the wording can change. Shown to the pitcher in plain language.
const REASONS = {
  not_a_fit: 'Not a fit for this garden',
  duplicate: 'Duplicate of an existing project',
  needs_rework: 'Needs more than a note can fix',
  capacity: 'Beyond what we can support now',
};

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pitcherEmail(project) {
  const name = project.created_by?.firstName || 'there';
  const gardenName = project.garden?.title || 'the garden';
  const title = escapeHtml(project.title);
  const note = project.review_note ? `<blockquote>${escapeHtml(project.review_note).replace(/\n/g, '<br>')}</blockquote>` : '';

  if (project.review_status === 'APPROVED') {
    const url = project.garden?.slug && project.slug
      ? `${SITE_URL}/gardens/${project.garden.slug}/p/${project.slug}`
      : `${SITE_URL}/manage/project/${project.documentId}`;
    return {
      subject: `Your project is live: ${project.title}`,
      html: `<p>Hi ${escapeHtml(name)},</p>
<p>Good news. ${escapeHtml(gardenName)} approved <b>${title}</b>, and it's now on the garden's public page.</p>
<p><a href="${url}">See your project</a></p>`,
    };
  }
  if (project.review_status === 'CHANGES_REQUESTED') {
    return {
      subject: `A few changes before ${project.title} is approved`,
      html: `<p>Hi ${escapeHtml(name)},</p>
<p>${escapeHtml(gardenName)} read your pitch for <b>${title}</b> and asked for a few changes first:</p>
${note}
<p><a href="${SITE_URL}/manage/project/${project.documentId}">Edit your pitch</a></p>`,
    };
  }
  if (project.review_status === 'REJECTED') {
    const reason = REASONS[project.review_reason] || 'Not a fit right now';
    return {
      subject: `About your pitch: ${project.title}`,
      html: `<p>Hi ${escapeHtml(name)},</p>
<p>Thanks for pitching <b>${title}</b>. ${escapeHtml(gardenName)} decided not to take it on.</p>
<p><b>Reason:</b> ${escapeHtml(reason)}</p>
${note}
<p>If you have another idea, you're welcome to pitch something new.</p>`,
    };
  }
  return null;
}

module.exports = ({ strapi }) => ({
  UNDO_WINDOW_MS,
  DECISIONS,
  REASONS,

  /** Oldest other project still waiting for a decision in the same garden. */
  async nextPending(project) {
    if (!project.garden?.id) return null;
    const next = await strapi.db.query('api::project.project').findOne({
      where: { garden: project.garden.id, review_status: 'CREATED', id: { $ne: project.id } },
      orderBy: { createdAt: 'asc' },
      select: ['id', 'documentId'],
    });
    return next || null;
  },

  /** Email the pitcher about every decision whose undo window has closed. */
  async sendDue() {
    const now = new Date();
    const due = await strapi.db.query('api::project.project').findMany({
      where: {
        review_status: { $in: Object.values(DECISIONS) },
        review_notify_after: { $lte: now },
        review_notified_at: { $null: true },
      },
      populate: ['created_by', 'garden'],
      limit: 50,
    });

    for (const project of due) {
      const to = project.created_by?.email || project.submitter_email;
      const message = pitcherEmail(project);
      // Mark as handled even on failure so a bad address isn't retried every minute.
      if (to && message) {
        try {
          await strapi.plugins['email'].services.email.send({
            to,
            from: FROM_ADDRESS,
            subject: message.subject,
            html: message.html,
          });
        } catch (err) {
          strapi.log.error(`[project review] email for project ${project.id} failed:`, err);
        }
      }
      await strapi.db.query('api::project.project').update({
        where: { id: project.id },
        data: { review_notified_at: now },
      });
    }
    return due.length;
  },

  /** Tell the garden's managers a new pitch is waiting. */
  async notifyManagersOfPitch(project) {
    if (!project.garden?.id) return;
    const garden = await strapi.db.query('api::garden.garden').findOne({
      where: { id: project.garden.id },
      populate: ['managers'],
    });
    const pitcher = [project.created_by?.firstName, project.created_by?.lastName].filter(Boolean).join(' ') || 'A member';
    const url = `${SITE_URL}/manage/gardens/${garden.slug}?review=${project.documentId}#projects`;
    for (const manager of garden?.managers || []) {
      if (!manager.email || manager.id === project.created_by?.id) continue;
      try {
        await strapi.plugins['email'].services.email.send({
          to: manager.email,
          from: FROM_ADDRESS,
          subject: `New project pitch at ${garden.title}: ${project.title}`,
          html: `<p>${escapeHtml(pitcher)} pitched <b>${escapeHtml(project.title)}</b> for ${escapeHtml(garden.title)}.</p>
<p>${escapeHtml(project.short_description || '')}</p>
<p><a href="${url}">Review the pitch</a></p>`,
        });
      } catch (err) {
        strapi.log.error(`[project review] new-pitch email to manager ${manager.id} failed:`, err);
      }
    }
  },
});
