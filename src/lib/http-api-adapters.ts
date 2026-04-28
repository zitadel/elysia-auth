/**
 * Rewrites a request URL using the AUTH_URL environment variable.
 *
 * When AUTH_URL is set, properties like hostname, protocol, and port
 * are taken from AUTH_URL while preserving the original request path.
 * When AUTH_URL is not set, the function respects X-Forwarded-Proto
 * and X-Forwarded-Host headers for proper URL resolution behind proxies.
 *
 * @param req - The original request
 * @param authUrl - Optional AUTH_URL value
 * @returns A new Request with the corrected URL
 */
export function reqWithEnvUrl(req: Request, authUrl?: string): Request {
  if (authUrl) {
    const reqUrlObj = new URL(req.url);
    const authUrlObj = new URL(authUrl);
    const props = [
      'hostname',
      'protocol',
      'port',
      'password',
      'username',
    ] as const;
    for (const prop of props) {
      if (authUrlObj[prop]) {
        reqUrlObj[prop] = authUrlObj[prop];
      }
    }
    return new Request(reqUrlObj.href, req);
  }
  const url = new URL(req.url);
  const newReq = new Request(url.href, req);
  const proto = newReq.headers.get('x-forwarded-proto');
  const host =
    newReq.headers.get('x-forwarded-host') ?? newReq.headers.get('host');
  if (proto != null) {
    url.protocol = proto.endsWith(':') ? proto : `${proto}:`;
  }
  if (host != null) {
    url.host = host;
    const portMatch = host.match(/:(\d+)$/);
    if (portMatch) {
      url.port = portMatch[1];
    } else {
      url.port = '';
    }
    newReq.headers.delete('x-forwarded-host');
    newReq.headers.delete('Host');
    newReq.headers.set('Host', host);
  }
  return new Request(url.href, newReq);
}
