import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import type { Request, Response } from 'express';
import { PROXY_LIMITS } from './constants';

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function ipv4IsPublic(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c <= 2) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function isPublicInternetAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return ipv4IsPublic(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) return ipv4IsPublic(mapped);
    const words = mapped.split(':').filter(Boolean);
    if (words.length === 2) {
      const high = parseInt(words[0], 16), low = parseInt(words[1], 16);
      return Number.isInteger(high) && Number.isInteger(low) && ipv4IsPublic(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return false;
  }
  const first = parseInt(normalized.split(':')[0] || '0', 16);
  const groups = normalized.split(':');
  const second = parseInt(groups[1] || '0', 16);
  // Globally routable unicast is 2000::/3; reject documentation and transition ranges.
  return (first & 0xe000) === 0x2000 &&
    !(first === 0x2001 && (second === 0x0db8 || second === 0x0000 || second === 0x0002 || second === 0x0010)) &&
    first !== 0x2002;
}

export function parsePublicProxyUrl(raw: string): URL {
  let target: URL;
  try { target = new URL(raw); } catch { throw new Error('프록시 대상 URL 형식이 올바르지 않습니다.'); }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
    throw new Error('HTTP 또는 HTTPS 외부 URL만 프록시할 수 있습니다.');
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    throw new Error('로컬 또는 내부 네트워크 주소는 프록시할 수 없습니다.');
  return target;
}

async function resolvePublicAddress(target: URL) {
  const host = target.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (!isPublicInternetAddress(host)) throw new Error('로컬 또는 예약된 IP 주소는 프록시할 수 없습니다.');
    return { address: host, family: isIP(host) };
  }
  const records = await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some(record => !isPublicInternetAddress(record.address)))
    throw new Error('내부 또는 예약된 IP로 연결되는 호스트는 프록시할 수 없습니다.');
  return records[0];
}

function requestPinned(target: URL, address: { address: string; family: number }, method: string, headers: Record<string, string>, body?: Buffer) {
  const transport = target.protocol === 'https:' ? https : http;
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const request = transport.request({
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port || undefined,
      method,
      path: `${target.pathname}${target.search}`,
      headers,
      timeout: PROXY_LIMITS.timeoutMs,
      lookup: ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, ip: string, family: number) => void) => callback(null, address.address, address.family)) as any,
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += data.length;
        if (size > PROXY_LIMITS.responseBytes) { request.destroy(new Error('프록시 응답이 10MB 제한을 초과했습니다.')); return; }
        chunks.push(data);
      });
      response.on('end', () => resolve({ status: response.statusCode || 502, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('프록시 요청 시간이 초과되었습니다.')));
    request.on('error', reject);
    if (body?.length) request.write(body);
    request.end();
  });
}

export async function handleSafeProxy(req: Request, res: Response) {
  try {
    const raw = String(req.query.url || req.body?.url || '');
    if (!raw) { res.status(400).json({ error: '프록시 대상 URL이 필요합니다.' }); return; }
    const target = parsePublicProxyUrl(raw);
    const address = await resolvePublicAddress(target);
    const method = req.method.toUpperCase();
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) { res.status(405).json({ error: '지원하지 않는 프록시 메서드입니다.' }); return; }
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && req.body !== undefined
      ? Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
      : undefined;
    if (body && body.length > PROXY_LIMITS.requestBytes) { res.status(413).json({ error: '프록시 요청 본문은 1MB 이하여야 합니다.' }); return; }
    const requestHeaders: Record<string, string> = { Accept: req.get('accept') || '*/*' };
    if (body) requestHeaders['Content-Length'] = String(body.length);
    if (body && req.is('application/json')) requestHeaders['Content-Type'] = 'application/json';
    // Never relay browser Authorization/Cookie headers to a user-controlled target.
    const result = await requestPinned(target, address, method, requestHeaders, body);
    if (REDIRECT_STATUS.has(result.status)) { res.status(502).json({ error: '프록시 대상의 리다이렉트는 보안상 차단했습니다.' }); return; }
    const contentType = result.headers['content-type'];
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).send(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : '프록시 요청에 실패했습니다.';
    const denied = /로컬|내부|예약된|HTTP 또는 HTTPS/.test(message);
    res.status(denied ? 403 : 502).json({ error: message });
  }
}
