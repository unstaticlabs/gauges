import { WEBSITE_URL } from '../config';
import { buildInviteUrl, isValidInviteCode, parseInviteUrl, toBase64Url } from '../invite';

const code = toBase64Url(new Uint8Array(32).map((_, i) => i * 7));

describe('invite links', () => {
  it('makes a 43-character base64url code from 32 bytes', () => {
    expect(code).toHaveLength(43);
    expect(isValidInviteCode(code)).toBe(true);
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
  });

  it('makes https links on the website by default', () => {
    const web = buildInviteUrl('L1', code);
    expect(web).toBe(`${WEBSITE_URL}/invite?label=L1&code=${code}`);
    expect(parseInviteUrl(web)).toEqual({ labelId: 'L1', code });
  });

  it('still reads the app scheme links of older builds', () => {
    const app = buildInviteUrl('L1', code, 'gauges://');
    expect(app).toBe(`gauges://invite?label=L1&code=${code}`);
    expect(parseInviteUrl(app)).toEqual({ labelId: 'L1', code });
    expect(parseInviteUrl(`gauges:///invite?label=L1&code=${code}`)).toEqual({ labelId: 'L1', code });
    const other = buildInviteUrl('L1', code, 'https://gauges.example.com');
    expect(other).toBe(`https://gauges.example.com/invite?label=L1&code=${code}`);
    expect(parseInviteUrl(other)).toEqual({ labelId: 'L1', code });
  });

  it('refuses other links and bad codes', () => {
    expect(parseInviteUrl(`gauges://other?label=L1&code=${code}`)).toBeNull();
    expect(parseInviteUrl('gauges://invite?label=L1&code=short')).toBeNull();
    expect(parseInviteUrl(`gauges://invite?code=${code}`)).toBeNull();
    expect(parseInviteUrl(`http://x.com/invite?label=L1&code=${code}`)).toBeNull();
    expect(parseInviteUrl('not a link')).toBeNull();
  });
});
