import { describe, it, expect } from 'vitest';
import { generateAppleMobileConfig } from './appleProfile';

describe('appleProfile generator', () => {
  it('generates a valid Apple Web Clip .mobileconfig plist with escaped XML', () => {
    const xml = generateAppleMobileConfig({
      appUrl: 'https://ez.example.com/?sheets=abc&foo=bar',
      label: 'EZ Center & Co',
      iconBase64: 'AAAA',
    });

    expect(xml).toContain('<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"');
    expect(xml).toContain('<string>com.apple.webClip.managed</string>');
    expect(xml).toContain('<string>https://ez.example.com/?sheets=abc&amp;foo=bar</string>');
    expect(xml).toContain('<string>EZ Center &amp; Co</string>');
    expect(xml).toContain('<key>FullScreen</key>');
    expect(xml).toContain('<true/>');
    expect(xml).toContain('<data>AAAA</data>');
  });

  it('rejects non-http(s) URLs', () => {
    expect(() =>
      generateAppleMobileConfig({
        appUrl: 'javascript:alert(1)',
        label: 'EZ Center',
      })
    ).toThrow();
  });
});
