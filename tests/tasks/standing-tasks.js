const UID = 'api::day-sheet-standing-task.day-sheet-standing-task';
const resetStandingList = async () => {
  const row = await strapi.documents(UID).findFirst();
  if (row) await strapi.documents(UID).delete({ documentId: row.documentId });
};

describe('Standing task service', function () {
  const svc = () => strapi.service(UID);

  afterAll(resetStandingList);

  describe('getList', function () {
    it('returns the five defaults, in order, with null notes, when the list is empty', async () => {
      await resetStandingList();
      const { items, source } = await svc().getList();

      expect(source).toBe('default');
      expect(items).toHaveLength(5);
      expect(items.map((i) => i.title)).toEqual(svc().DEFAULT_STANDING_TASKS.map((i) => i.title));
      items.forEach((i) => expect(i.note).toBeNull());
    });
  });

  describe('computeKey', function () {
    it('returns an 8-char lowercase hex string', () => {
      expect(svc().computeKey('Weed pathways')).toMatch(/^[0-9a-f]{8}$/);
    });

    it('is stable across whitespace/case differences', () => {
      expect(svc().computeKey('Weed  Pathways ')).toBe(svc().computeKey('weed pathways'));
    });
  });

  describe('replaceList validation (AC33)', function () {
    it('accepts a title of exactly 120 chars and a note of exactly 500 chars', async () => {
      await resetStandingList();
      const { items } = await svc().replaceList([{ title: 'x'.repeat(120), note: 'y'.repeat(500) }]);

      expect(items[0].title).toHaveLength(120);
      expect(items[0].note).toHaveLength(500);
    });

    it('rejects a 121-char title', async () => {
      await expect(svc().replaceList([{ title: 'x'.repeat(121) }]))
        .rejects.toThrow('Item 0: title must be 120 characters or fewer');
    });

    it('rejects a 501-char note', async () => {
      await expect(svc().replaceList([{ title: 'valid title', note: 'y'.repeat(501) }]))
        .rejects.toThrow('Item 0: note must be 500 characters or fewer');
    });
  });

  describe('replaceList persistence (AC37)', function () {
    it('keeps exactly one single-type row and exactly N component rows after repeated saves', async () => {
      await resetStandingList();
      const list = [{ title: 'Item A', note: null }, { title: 'Item B', note: null }];

      await svc().replaceList(list);
      await svc().replaceList(list);

      const rowCount = await strapi.db.query(UID).count({});
      expect(rowCount).toBe(1);

      let componentCount;
      try {
        const [{ c }] = await strapi.db.connection('components_checklist_standing_tasks').count('* as c');
        componentCount = Number(c);
      } catch (e) {
        const tables = await strapi.db.connection.raw("SELECT name FROM sqlite_master WHERE type='table'");
        const names = tables.map((t) => t.name || t.NAME);
        strapi.log.warn('components_checklist_standing_tasks not found, tables: ' + JSON.stringify(names));
        throw e;
      }
      expect(componentCount).toBe(2);
    });
  });

  describe('replaceList validation messages never echo submitted content', function () {
    it('rejects a non-array payload', async () => {
      await expect(svc().replaceList('not-an-array')).rejects.toThrow('standing_tasks must be an array');
    });

    it('rejects more than 30 items', async () => {
      const items = Array.from({ length: 31 }, (_, i) => ({ title: 'Item ' + i }));
      await expect(svc().replaceList(items)).rejects.toThrow('standing_tasks may contain at most 30 items');
    });

    it('rejects a missing/non-string title', async () => {
      await expect(svc().replaceList([{ title: 42 }])).rejects.toThrow('Item 0: title is required');
    });

    it('rejects a whitespace-only title', async () => {
      await expect(svc().replaceList([{ title: '   ' }])).rejects.toThrow('Item 0: title is required');
    });

    it('rejects a non-string note', async () => {
      await expect(svc().replaceList([{ title: 'ok', note: 42 }])).rejects.toThrow('Item 0: note must be a string');
    });

    it('never echoes submitted text in a validation message, even for an oversized title', async () => {
      await expect(svc().replaceList([{ title: 'SECRET-TITLE-XYZ'.repeat(20) }]))
        .rejects.toThrow(/^Item 0: title must be 120 characters or fewer$/);
    });
  });
});
