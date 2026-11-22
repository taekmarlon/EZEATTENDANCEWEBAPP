export interface AppleMobileConfigOptions {
  appUrl: string;
  label?: string;
  iconBase64?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an Apple Configuration Profile (.mobileconfig) installing EZ Center Portal
 * as a full-screen standalone Home Screen Web Clip on iOS and iPadOS devices.
 */
export function generateAppleMobileConfig({
  appUrl,
  label = 'EZ Center',
  iconBase64,
}: AppleMobileConfigOptions): string {
  let parsed: URL;
  try {
    parsed = new URL(appUrl.trim());
  } catch {
    throw new Error('Please enter a valid http:// or https:// app URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('App URL must start with https:// or http://.');
  }

  const safeUrl = escapeXml(parsed.toString());
  const safeLabel = escapeXml(label.trim() || 'EZ Center');
  const iconBlock = iconBase64
    ? `        <key>Icon</key>
        <data>${iconBase64.replace(/\s+/g, '')}</data>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
${iconBlock}      <key>IgnoreManifestScope</key>
      <false/>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>${safeLabel}</string>
      <key>PayloadDescription</key>
      <string>Adds EZ Center Portal to your iPhone or iPad Home Screen</string>
      <key>PayloadDisplayName</key>
      <string>${safeLabel} Web Clip</string>
      <key>PayloadIdentifier</key>
      <string>com.ezcenter.portal.webclip</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>6D28D901-4E5A-4B1C-8A12-100000000001</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>${safeUrl}</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Install EZ Center Portal on your Apple Home Screen</string>
  <key>PayloadDisplayName</key>
  <string>${safeLabel} Portal</string>
  <key>PayloadIdentifier</key>
  <string>com.ezcenter.portal.profile</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>6D28D901-4E5A-4B1C-8A12-100000000002</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}
