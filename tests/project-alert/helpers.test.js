/**
 * Unit tests for project-alert parsing, email builders and Nominatim parsing.
 */

const service = require('../../src/api/project-alert/services/project-alert')({ strapi: {} });
const { parseAddress } = require('../../src/utils/reverse-geocode');

describe('project-alert parseTarget', () => {
  it('accepts a 5-digit zip', () => {
    expect(service.parseTarget({ zip: ' 94607 ' })).toEqual({ scope: 'zip', zip: '94607', label: '94607' });
  });

  it('rejects a malformed zip', () => {
    expect(service.parseTarget({ zip: '9460' }).error).toBeDefined();
    expect(service.parseTarget({ zip: 'abcde' }).error).toBeDefined();
  });

  it('normalizes a city and drops the state', () => {
    expect(service.parseTarget({ city: '  san   leandro, CA' })).toEqual({
      scope: 'city',
      city: 'san leandro',
      label: 'San Leandro, CA',
    });
  });

  it('prefers zip when both are given', () => {
    expect(service.parseTarget({ zip: '94607', city: 'Oakland' }).scope).toBe('zip');
  });

  it('requires one of zip or city', () => {
    expect(service.parseTarget({}).error).toBeDefined();
    expect(service.parseTarget({ city: ' , ' }).error).toBeDefined();
  });
});

describe('project-alert emails', () => {
  const sub = { email: 'a@example.com', scope: 'zip', zip: '94607', display_label: '94607', unsubscribe_token: 'tok-1' };

  const link = 'https://steward.garden/set-password?code=abc';

  it('welcome email for a new address offers to finish the account', () => {
    const { subject, html } = service.welcomeEmail(sub, { accountUrl: link, existing: false });
    expect(subject).toContain('94607');
    expect(html).toContain(link);
    expect(html).toContain('finish creating your free Garden Steward account');
    expect(html).toContain('/alerts/unsubscribe?token=tok-1');
  });

  it('welcome email for an existing account offers to set a password', () => {
    const { html } = service.welcomeEmail(sub, { accountUrl: link, existing: true });
    expect(html).toContain(link);
    expect(html).toContain("If you've never set a password");
    expect(html).not.toContain('finish creating');
  });

  it('welcome email for a signed-in signup has no password link', () => {
    const { html } = service.welcomeEmail(sub, { accountUrl: null, existing: true });
    expect(html).not.toContain('set-password');
    expect(html).toContain("You're signed in");
    expect(html).toContain('/alerts/unsubscribe?token=tok-1');
  });

  it('project email links the project and escapes its title', () => {
    const { subject, html } = service.projectEmail(
      { title: 'Beds <b>', slug: 'beds', short_description: 'New beds', garden: { slug: 'gx', title: 'Garden X' } },
      sub,
    );
    expect(subject).toBe('New project in 94607: Beds <b>');
    expect(html).toContain('Beds &lt;b&gt;');
    expect(html).toContain('https://steward.garden/gardens/gx/p/beds');
    expect(html).toContain('/alerts/unsubscribe?token=tok-1');
  });
});

describe('reverse-geocode parseAddress', () => {
  it('reads city and zip', () => {
    expect(parseAddress({ city: 'Oakland', postcode: '94607', state: 'California' })).toEqual({
      city: 'Oakland',
      zip: '94607',
      state: 'California',
    });
  });

  it('falls back to town and trims zip+4', () => {
    expect(parseAddress({ town: 'Alameda', postcode: '94501-1234' })).toMatchObject({ city: 'Alameda', zip: '94501' });
  });

  it('returns null with nothing usable', () => {
    expect(parseAddress({ country: 'US' })).toBeNull();
    expect(parseAddress(null)).toBeNull();
  });
});
