'use strict';

const {
  reconcile, formatReport, monthRange, parseArgs, currentPeriod,
} = require('../../scripts/lib/reconcile-usage');

const makeClient = () => ({
  usage: {
    records: {
      list: jest.fn(async ({ category }) =>
        category === 'sms-outbound' ? [{ usage: '100', count: '100' }] : [{ usage: '6', count: '2' }]),
    },
  },
});

const makeTotals = (smsSegments) => jest.fn(async () => ({
  smsSegments,
  mmsCount: 2,
  byCategory: {},
  byDirection: {},
  attributed: { rows: 0, segments: smsSegments, units: smsSegments },
  unattributed: { rows: 0, segments: 0, units: 0 },
}));

describe('reconcile core', () => {
  test('1% SMS drift, 0% MMS drift, exits 0', async () => {
    const twilioClient = makeClient();
    const getTotals = makeTotals(99);
    const result = await reconcile({ period: '2026-09', twilioClient, getTotals });
    expect(result.drift.sms).toBeCloseTo(-0.01, 10);
    expect(result.drift.mms).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(formatReport(result)).toContain('-1.00%');
    expect(formatReport(result)).toContain('PASS');
    expect(getTotals).toHaveBeenCalledWith({ period: '2026-09' });
  });

  test('90 segments: -10% drift, exits 1', async () => {
    const result = await reconcile({ period: '2026-09', twilioClient: makeClient(), getTotals: makeTotals(90) });
    expect(result.drift.sms).toBeCloseTo(-0.1, 10);
    expect(result.exitCode).toBe(1);
    const report = formatReport(result);
    expect(report).toContain('-10.00%');
    expect(report).toContain('FAIL');
  });

  test('queries Twilio usage for both categories and nothing else', async () => {
    const twilioClient = makeClient();
    await reconcile({ period: '2026-09', twilioClient, getTotals: makeTotals(99) });
    const { list } = twilioClient.usage.records;
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledWith({ category: 'sms-outbound', startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(list).toHaveBeenCalledWith({ category: 'mms-outbound', startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(Object.keys(twilioClient)).toEqual(['usage']);
    expect(Object.keys(twilioClient.usage)).toEqual(['records']);
    expect(Object.keys(twilioClient.usage.records)).toEqual(['list']);
  });

  test('zero Twilio usage', async () => {
    const twilioClient = { usage: { records: { list: jest.fn(async () => []) } } };
    const getTotals = jest.fn(async () => ({ smsSegments: 0, mmsCount: 0 }));
    const result = await reconcile({ period: '2026-09', twilioClient, getTotals });
    expect(result.drift).toEqual({ sms: 0, mms: 0 });
    expect(result.unattributedShare).toBe(0);
    expect(result.exitCode).toBe(0);
  });
});

describe('helpers', () => {
  test('monthRange handles leap years and 31-day months', () => {
    expect(monthRange('2028-02')).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
    expect(monthRange('2026-12').endDate).toBe('2026-12-31');
  });

  test('parseArgs defaults', () => {
    expect(parseArgs([])).toEqual({ period: currentPeriod(), maxDrift: 0.02 });
  });

  test('parseArgs accepts values', () => {
    expect(parseArgs(['--period', '2026-09', '--max-drift', '0.05'])).toEqual({ period: '2026-09', maxDrift: 0.05 });
  });

  test('parseArgs rejects bad input', () => {
    expect(() => parseArgs(['--period', '2026-13'])).toThrow(/Usage/);
    expect(() => parseArgs(['--period', '2026-9'])).toThrow(/Usage/);
    expect(() => parseArgs(['--period'])).toThrow(/Usage/);
    expect(() => parseArgs(['--max-drift', '-1'])).toThrow(/Usage/);
    expect(() => parseArgs(['--max-drift', 'abc'])).toThrow(/Usage/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Usage/);
  });
});
