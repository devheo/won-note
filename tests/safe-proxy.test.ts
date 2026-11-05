import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicInternetAddress, parsePublicProxyUrl } from '../server/safeProxy';

test('public proxy URL parser accepts external HTTP URLs', () => {
  assert.equal(parsePublicProxyUrl('https://example.com/api').hostname, 'example.com');
});

test('proxy URL parser rejects local, credentialed, and non-HTTP targets', () => {
  for (const value of [
    'file:///etc/passwd',
    'ftp://example.com/file',
    'http://user:password@example.com/',
    'http://localhost:3000/',
    'http://printer.local/',
  ]) assert.throws(() => parsePublicProxyUrl(value));
});

test('proxy address policy blocks private, loopback, link-local, documentation, and mapped private IPs', () => {
  for (const address of [
    '10.1.2.3', '127.0.0.1', '172.20.0.1', '192.168.1.2', '169.254.169.254',
    '100.64.0.1', '198.18.0.1', '203.0.113.5', '::1', 'fc00::1', 'fe80::1',
    '::ffff:192.168.1.1', '::ffff:7f00:1', '2001:0db8::1',
  ]) assert.equal(isPublicInternetAddress(address), false, address);
});

test('proxy address policy accepts public IPv4 and globally routable IPv6', () => {
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicInternetAddress(address), true, address);
});
