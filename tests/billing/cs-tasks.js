'use strict';

/**
 * Call-site tagging for garden-task and instruction sends (AC38, sites #6, #7, #14, #17).
 * Sites #7, #14 and #17 are covered by the code check; #6 (sendTask) is run end to end here.
 */

const {
  UID, uniq, makeOrg, makeGarden, makeUser, pollLedger, stubTransport, clearResolver,
} = require('./helpers');

describe('billing: cs-tasks', () => {
  let org;
  let g;
  let v;

  beforeAll(async () => {
    org = await makeOrg();
    g = await makeGarden({ organization: org.documentId });
    v = await makeUser({ activeGarden: g.published.id });
  });

  beforeEach(clearResolver);
  afterEach(clearResolver);

  describe('#6 garden-task.send-task', () => {
    it('writes one reminder row attributed to the task garden org', async () => {
      stubTransport();

      const created = await strapi.db.query(UID.TASK).create({
        data: {
          title: uniq('Task'),
          type: 'Weeding',
          task_status: 'INITIALIZED',
          garden: g.published.id,
          volunteers: [v.id],
          publishedAt: new Date(),
        },
      });
      const task = await strapi.db.query(UID.TASK).findOne({
        where: { id: created.id },
        populate: ['garden', 'volunteers'],
      });

      const result = strapi.service('api::garden-task.garden-task').sendTask(task, true);
      expect(result.success).toBe(true);

      const rows = await pollLedger({ source: 'garden-task.send-task', to_number: v.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'reminder',
        source: 'garden-task.send-task',
        to_number: v.phoneNumber,
        organization_document_id: org.documentId,
        garden_document_id: g.documentId,
      });
      expect(rows[0].user.id).toBe(v.id);
    });
  });
});
