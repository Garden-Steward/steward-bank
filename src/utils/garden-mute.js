'use strict';

/**
 * Per-garden mute. A member who mutes a garden stays a member but stops
 * getting that garden's group texts (volunteer-day announcements, SMS
 * campaigns). Texts about tasks they've taken on still reach them.
 *
 * Stored on the user as `muted_gardens`: garden documentIds, so the draft and
 * published rows of one garden count as the same garden.
 */

function mutedList(user) {
  return Array.isArray(user?.muted_gardens) ? user.muted_gardens : [];
}

function hasMuted(user, garden) {
  return !!garden?.documentId && mutedList(user).includes(garden.documentId);
}

/** Drop the users who muted this garden. */
function withoutMuted(users, garden) {
  if (!Array.isArray(users)) return users;
  return users.filter((u) => !hasMuted(u, garden));
}

module.exports = { mutedList, hasMuted, withoutMuted };
