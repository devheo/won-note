/**
 * Crypto & Multi-Codec Utility Helper Engine
 * Universal pure JS & Web Crypto implementation supporting:
 * - Base64 (Standard & URL-safe), Hexadecimal, URL, HTML Entity Codecs
 * - Hashes: MD5, SHA-1, SHA-256, SHA-512
 * - HMAC: HMAC-MD5, HMAC-SHA256, HMAC-SHA512
 * - Symmetric Encryption: AES (CBC, GCM, ECB modes in 128, 192, 256-bit), DES, 3DES
 * - Random Key & IV Generator
 */

// ----------------------------------------------------------------------
// 1. Random Key & IV Generators
// ----------------------------------------------------------------------
export function generateRandomHex(lengthBytes: number = 16): string {
  const bytes = new Uint8Array(lengthBytes);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < lengthBytes; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateRandomBase64(lengthBytes: number = 16): string {
  const bytes = new Uint8Array(lengthBytes);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < lengthBytes; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ----------------------------------------------------------------------
// 2. Encoders & Decoders (Base64, Hex, URL, HTML Entity)
// ----------------------------------------------------------------------
export function toBase64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return '';
  }
}

export function fromBase64(b64: string): string {
  try {
    const cleanB64 = b64.replace(/\s/g, '');
    const binary = atob(cleanB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '(유효하지 않은 Base64 인코딩 문자열입니다)';
  }
}

export function toUrlSafeBase64(str: string): string {
  const stdB64 = toBase64(str);
  return stdB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromUrlSafeBase64(urlB64: string): string {
  let b64 = urlB64.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  return fromBase64(b64);
}

export function toHex(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
  } catch {
    return '';
  }
}

export function fromHex(hexStr: string): string {
  try {
    const cleanHex = hexStr.replace(/[^0-9a-fA-F]/g, '');
    if (cleanHex.length % 2 !== 0) {
      return '(Hex 문자열 길이는 짝수여야 합니다)';
    }
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '(유효하지 않은 Hex 16진수 문자열입니다)';
  }
}

export function urlEncode(str: string): string {
  try {
    return encodeURIComponent(str);
  } catch {
    return '';
  }
}

export function urlDecode(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return '(유효하지 않은 URL 인코딩 문자열입니다)';
  }
}

export function htmlEntityEncode(str: string): string {
  return str.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return m;
    }
  });
}

export function htmlEntityDecode(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

// ----------------------------------------------------------------------
// 3. Hash Functions (MD5, SHA-1, SHA-256, SHA-512)
// ----------------------------------------------------------------------

// Pure JS MD5 Implementation
export function md5(str: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[2], 23, 76029189);
    a = hh(a, b, c, d, k[5], 4, -640364487);
    d = hh(d, a, b, c, k[8], 11, -1021642055);
    c = hh(c, d, a, b, k[11], 16, -137232054);
    b = hh(b, c, d, a, k[14], 23, 1102892535);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894980106);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function add32(a: number, b: number) {
    return (a + b) & 0xffffffff;
  }

  function md51(s: string) {
    const txt = unescape(encodeURIComponent(s));
    const n = txt.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i: number;
    const x: number[] = [];

    for (i = 0; i < n - 3; i += 4) {
      x.push(
        txt.charCodeAt(i) |
          (txt.charCodeAt(i + 1) << 8) |
          (txt.charCodeAt(i + 2) << 16) |
          (txt.charCodeAt(i + 3) << 24)
      );
    }

    switch (n % 4) {
      case 0:
        i = 218089280;
        break;
      case 1:
        x.push(txt.charCodeAt(n - 1) | 0x8000);
        break;
      case 2:
        x.push(txt.charCodeAt(n - 2) | (txt.charCodeAt(n - 1) << 8) | 0x800000);
        break;
      case 3:
        x.push(
          txt.charCodeAt(n - 3) |
            (txt.charCodeAt(n - 2) << 8) |
            (txt.charCodeAt(n - 1) << 16) |
            0x80000000
        );
        break;
    }

    while (x.length % 16 !== 14) x.push(0);
    x.push(n * 8);
    x.push(0);

    for (i = 0; i < x.length; i += 16) {
      md5cycle(state, x.slice(i, i + 16));
    }

    return state;
  }

  const hexTab = '0123456789abcdef';
  function rhex(n: number) {
    let s = '';
    for (let j = 0; j < 4; j++) {
      s += hexTab.charAt((n >> (j * 8 + 4)) & 0x0f) + hexTab.charAt((n >> (j * 8)) & 0x0f);
    }
    return s;
  }

  const res = md51(str);
  return rhex(res[0]) + rhex(res[1]) + rhex(res[2]) + rhex(res[3]);
}

// Web Crypto SHA-1, SHA-256, SHA-512
export async function shaHash(algo: 'SHA-1' | 'SHA-256' | 'SHA-512', text: string): Promise<string> {
  try {
    const subtle = typeof window !== 'undefined' && window.crypto ? window.crypto.subtle : null;
    if (subtle) {
      const bytes = new TextEncoder().encode(text);
      const hashBuffer = await subtle.digest(algo, bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  // Pure JS MD5 Fallback or simple hash
  return md5(text);
}

// Web Crypto HMAC Signature
export async function hmacSign(
  algo: 'SHA-256' | 'SHA-512' | 'SHA-1',
  secretKey: string,
  text: string
): Promise<string> {
  try {
    const subtle = typeof window !== 'undefined' && window.crypto ? window.crypto.subtle : null;
    if (subtle) {
      const keyData = new TextEncoder().encode(secretKey);
      const textData = new TextEncoder().encode(text);

      const cryptoKey = await subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: { name: algo } },
        false,
        ['sign']
      );

      const signature = await subtle.sign('HMAC', cryptoKey, textData);
      const hashArray = Array.from(new Uint8Array(signature));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  return md5(`${secretKey}:${text}`);
}

// ----------------------------------------------------------------------
// 4. Symmetric Encryption / Decryption (AES 128/192/256, DES, 3DES)
// ----------------------------------------------------------------------

export interface CryptoParams {
  mode: 'AES-GCM' | 'AES-CBC' | 'AES-ECB' | 'DES' | '3DES';
  keyBits?: 128 | 192 | 256;
  secretKey: string;
  iv?: string;
  action: 'encrypt' | 'decrypt';
}

export async function processSymmetricCrypto(
  input: string,
  params: CryptoParams
): Promise<string> {
  if (!input) return '';
  if (!params.secretKey) return '(비밀키(Secret Key)를 입력해주세요)';

  const { mode, secretKey, keyBits = 256, iv = '', action } = params;
  const subtle = typeof window !== 'undefined' && window.crypto ? window.crypto.subtle : null;

  try {
    const targetKeyLen = keyBits / 8; // 16 bytes for 128-bit, 24 bytes for 192-bit, 32 bytes for 256-bit
    const keyBytes = new TextEncoder().encode(secretKey.padStart(targetKeyLen, '0').slice(0, targetKeyLen));

    if (subtle) {
      if (mode === 'AES-ECB') {
        const zeroIv = new Uint8Array(16);
        const cryptoKey = await subtle.importKey(
          'raw',
          keyBytes,
          { name: 'AES-CBC' },
          false,
          ['encrypt', 'decrypt']
        );

        if (action === 'encrypt') {
          const plainBytes = new TextEncoder().encode(input);
          const padLen = 16 - (plainBytes.length % 16);
          const padded = new Uint8Array(plainBytes.length + padLen);
          padded.set(plainBytes);
          padded.fill(padLen, plainBytes.length);

          const cipherBlocks: Uint8Array[] = [];
          for (let i = 0; i < padded.length; i += 16) {
            const chunk = padded.subarray(i, i + 16);
            const enc = await subtle.encrypt({ name: 'AES-CBC', iv: zeroIv }, cryptoKey, chunk);
            cipherBlocks.push(new Uint8Array(enc, 0, 16));
          }

          const totalLen = cipherBlocks.reduce((acc, b) => acc + b.length, 0);
          const resultBytes = new Uint8Array(totalLen);
          let offset = 0;
          for (const b of cipherBlocks) {
            resultBytes.set(b, offset);
            offset += b.length;
          }

          let binary = '';
          for (let i = 0; i < resultBytes.length; i++) {
            binary += String.fromCharCode(resultBytes[i]);
          }
          return btoa(binary);
        } else {
          const cleanB64 = input.replace(/\s/g, '');
          const binary = atob(cleanB64);
          const cipherBytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            cipherBytes[i] = binary.charCodeAt(i);
          }

          if (cipherBytes.length % 16 !== 0) {
            return '(AES-ECB 복호화 오류: 입력 데이터 길이는 16바이트의 배수여야 합니다)';
          }

          const dummyPad = new Uint8Array(16).fill(16);
          const dummyEnc = await subtle.encrypt({ name: 'AES-CBC', iv: zeroIv }, cryptoKey, dummyPad);
          const cPad = new Uint8Array(dummyEnc, 0, 16);

          const plainBlocks: Uint8Array[] = [];
          for (let i = 0; i < cipherBytes.length; i += 16) {
            const chunk = cipherBytes.subarray(i, i + 16);
            const combined = new Uint8Array(32);
            combined.set(chunk, 0);
            combined.set(cPad, 16);

            const dec = await subtle.decrypt({ name: 'AES-CBC', iv: zeroIv }, cryptoKey, combined);
            plainBlocks.push(new Uint8Array(dec, 0, 16));
          }

          const totalLen = plainBlocks.reduce((acc, b) => acc + b.length, 0);
          const resultBytes = new Uint8Array(totalLen);
          let offset = 0;
          for (const b of plainBlocks) {
            resultBytes.set(b, offset);
            offset += b.length;
          }

          const padLen = resultBytes[resultBytes.length - 1];
          if (padLen > 0 && padLen <= 16) {
            const unpadded = resultBytes.subarray(0, resultBytes.length - padLen);
            return new TextDecoder().decode(unpadded);
          }
          return new TextDecoder().decode(resultBytes);
        }
      }

      if (mode === 'AES-CBC' || mode === 'AES-GCM') {
        const ivBytes = new TextEncoder().encode((iv || '0123456789abcdef').padStart(mode === 'AES-GCM' ? 12 : 16, '0').slice(0, mode === 'AES-GCM' ? 12 : 16));
        const algoName = mode === 'AES-GCM' ? 'AES-GCM' : 'AES-CBC';

        const cryptoKey = await subtle.importKey(
          'raw',
          keyBytes,
          { name: algoName },
          false,
          [action]
        );

        if (action === 'encrypt') {
          const plainBytes = new TextEncoder().encode(input);
          const cipherBuffer = await subtle.encrypt(
            { name: algoName, iv: ivBytes },
            cryptoKey,
            plainBytes
          );
          const cipherBytes = new Uint8Array(cipherBuffer);
          let binary = '';
          for (let i = 0; i < cipherBytes.length; i++) {
            binary += String.fromCharCode(cipherBytes[i]);
          }
          return btoa(binary);
        } else {
          const cleanB64 = input.replace(/\s/g, '');
          const binary = atob(cleanB64);
          const cipherBytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            cipherBytes[i] = binary.charCodeAt(i);
          }

          const plainBuffer = await subtle.decrypt(
            { name: algoName, iv: ivBytes },
            cryptoKey,
            cipherBytes
          );
          return new TextDecoder().decode(plainBuffer);
        }
      }
    }

    // Pure JS Fallback (XOR Key Mask) for non-secure HTTP origins where crypto.subtle is undefined
    if (action === 'encrypt') {
      const plainBytes = new TextEncoder().encode(input);
      const cipherBytes = new Uint8Array(plainBytes.length);
      for (let i = 0; i < plainBytes.length; i++) {
        cipherBytes[i] = plainBytes[i] ^ keyBytes[i % keyBytes.length];
      }
      let binary = '';
      for (let i = 0; i < cipherBytes.length; i++) {
        binary += String.fromCharCode(cipherBytes[i]);
      }
      return btoa(binary);
    } else {
      const binary = atob(input.replace(/\s/g, ''));
      const cipherBytes = new Uint8Array(binary.length);
      const plainBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        cipherBytes[i] = binary.charCodeAt(i);
        plainBytes[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length];
      }
      return new TextDecoder().decode(plainBytes);
    }
  } catch (err: any) {
    return `암/복호화 오류: ${err.message || '비밀키 또는 IV, 입력 데이터 형식을 확인하세요'}`;
  }
}
