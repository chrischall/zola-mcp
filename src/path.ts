/**
 * Make a caller-supplied id safe to interpolate as ONE path segment of a
 * mobile-api URL.
 *
 * Ids reach us from the model, which can be steered by text it read (a vendor
 * inquiry, a storefront description). Unencoded, an id like
 * `../../../v3/<route>?` walks the authenticated request — Bearer token, WAF
 * headers and the tool's own HTTP method — to any other route on the user's
 * account, because fetch resolves dot-segments and `?`/`#` truncate the path.
 *
 * `encodeURIComponent` neutralises `/`, `?`, `#` and whitespace, but leaves
 * `.` alone, so a bare `.` or `..` would still be resolved as a dot-segment.
 * Those (and the empty id) are rejected outright.
 */
export function pathSegment(value: string | number): string {
  const raw = String(value);
  if (raw === '' || raw === '.' || raw === '..') {
    throw new Error(`Invalid id ${JSON.stringify(raw)}: not a usable URL path segment`);
  }
  return encodeURIComponent(raw);
}
