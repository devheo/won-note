import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  X,
  Lock,
  Copy,
  Check,
  Trash2,
  Sparkles,
  ArrowLeftRight,
  Key,
  KeyRound,
  Download,
  Upload,
  FileCode,
  Shield,
  Hash,
  Binary,
  ClipboardPaste,
  Wand2,
} from 'lucide-react';
import {
  generateRandomHex,
  generateRandomBase64,
  toBase64,
  fromBase64,
  toUrlSafeBase64,
  fromUrlSafeBase64,
  toHex,
  fromHex,
  urlEncode,
  urlDecode,
  htmlEntityEncode,
  htmlEntityDecode,
  md5,
  shaHash,
  hmacSign,
  processSymmetricCrypto,
} from '../../utils/cryptoCodecHelper';

interface CryptoCodecModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type MainTab = 'crypto' | 'hash' | 'codec';

const SAMPLE_TEXT = 'WonBee Note - High Performance Workspace & Crypto Codec Utility 2026';

export const CryptoCodecModal: React.FC<CryptoCodecModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<MainTab>('crypto');
  const [rawInput, setRawInput] = useState<string>(SAMPLE_TEXT);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 1. Symmetric Crypto States
  const [cryptoAlgo, setCryptoAlgo] = useState<'AES-CBC' | 'AES-GCM' | 'AES-ECB' | 'DES' | '3DES'>('AES-CBC');
  const [keyBits, setKeyBits] = useState<128 | 192 | 256>(256);
  const [cryptoAction, setCryptoAction] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [secretKey, setSecretKey] = useState<string>('WonBeeSecretKey2026PasswordKey!!');
  const [ivValue, setIvValue] = useState<string>('0123456789abcdef');

  // Async Crypto Result state for Web Crypto
  const [asyncCryptoResult, setAsyncCryptoResult] = useState<string>('');

  // 2. Hash & HMAC States
  const [hashAlgo, setHashAlgo] = useState<'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512'>('SHA-256');
  const [isHmac, setIsHmac] = useState<boolean>(false);
  const [hmacSecret, setHmacSecret] = useState<string>('WonBeeHmacKey2026');
  const [asyncHashResult, setAsyncHashResult] = useState<string>('');

  // 3. Multi Codec States
  const [codecType, setCodecType] = useState<
    'base64' | 'url_base64' | 'hex' | 'url' | 'html_entity'
  >('base64');
  const [codecAction, setCodecAction] = useState<'encode' | 'decode'>('encode');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Re-calculate Symmetric Crypto Result
  useMemo(() => {
    if (!rawInput.trim()) {
      setAsyncCryptoResult('');
      return;
    }
    processSymmetricCrypto(rawInput, {
      mode: cryptoAlgo,
      keyBits,
      secretKey,
      iv: ivValue,
      action: cryptoAction,
    }).then((res) => {
      setAsyncCryptoResult(res);
    });
  }, [rawInput, cryptoAlgo, keyBits, secretKey, ivValue, cryptoAction]);

  // Re-calculate Hash & HMAC Result
  useMemo(() => {
    if (!rawInput.trim()) {
      setAsyncHashResult('');
      return;
    }
    if (isHmac) {
      const algo = hashAlgo === 'MD5' ? 'SHA-256' : hashAlgo;
      hmacSign(algo as any, hmacSecret, rawInput).then((res) => {
        setAsyncHashResult(res);
      });
    } else {
      if (hashAlgo === 'MD5') {
        setAsyncHashResult(md5(rawInput));
      } else {
        shaHash(hashAlgo, rawInput).then((res) => {
          setAsyncHashResult(res);
        });
      }
    }
  }, [rawInput, hashAlgo, isHmac, hmacSecret]);

  // Sync Multi Codec Result
  const codecResult = useMemo(() => {
    if (!rawInput) return '';
    if (codecAction === 'encode') {
      switch (codecType) {
        case 'base64':
          return toBase64(rawInput);
        case 'url_base64':
          return toUrlSafeBase64(rawInput);
        case 'hex':
          return toHex(rawInput);
        case 'url':
          return urlEncode(rawInput);
        case 'html_entity':
          return htmlEntityEncode(rawInput);
        default:
          return '';
      }
    } else {
      switch (codecType) {
        case 'base64':
          return fromBase64(rawInput);
        case 'url_base64':
          return fromUrlSafeBase64(rawInput);
        case 'hex':
          return fromHex(rawInput);
        case 'url':
          return urlDecode(rawInput);
        case 'html_entity':
          return htmlEntityDecode(rawInput);
        default:
          return '';
      }
    }
  }, [rawInput, codecType, codecAction]);

  // Active Output Selection
  const activeOutput = useMemo(() => {
    if (activeTab === 'crypto') return asyncCryptoResult;
    if (activeTab === 'hash') return asyncHashResult;
    return codecResult;
  }, [activeTab, asyncCryptoResult, asyncHashResult, codecResult]);

  const handleCopyOutput = useCallback(async () => {
    if (!activeOutput) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(activeOutput);
        showToast('✓ 결과가 클립보드에 복사되었습니다.');
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = activeOutput;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('✓ 결과가 클립보드에 복사되었습니다.');
    } catch (_) {
      showToast('⚠ 복사 실패');
    }
  }, [activeOutput]);

  const handleSwapInputOutput = () => {
    if (!activeOutput || activeOutput.startsWith('(') || activeOutput.startsWith('암/복호화 오류')) {
      showToast('⚠ 스왑할 수 있는 유효한 결과 데이터가 없습니다.');
      return;
    }
    setRawInput(activeOutput);
    if (activeTab === 'crypto') {
      setCryptoAction((prev) => (prev === 'encrypt' ? 'decrypt' : 'encrypt'));
    } else if (activeTab === 'codec') {
      setCodecAction((prev) => (prev === 'encode' ? 'decode' : 'encode'));
    }
    showToast('⇄ 원본 입력과 결과 데이터가 스왑되었습니다.');
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text) {
          setRawInput(text);
          showToast('✓ 클립보드 텍스트가 입력창에 적용되었습니다.');
          return;
        }
      }
      showToast('💡 [Ctrl+V] 단축키를 눌러 붙여넣어 주세요.');
    } catch (_) {
      showToast('💡 [Ctrl+V] 단축키를 눌러 붙여넣어 주세요.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = (ev.target?.result as string) || '';
        setRawInput(text);
        showToast(`✓ 파일 (${file.name}) 내용이 입력창에 불러와졌습니다.`);
      };
      reader.readAsText(file);
    }
  };

  const handleDownloadOutput = () => {
    if (!activeOutput) return;
    const blob = new Blob([activeOutput], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wonbee_crypto_result.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('✓ 결과 텍스트 파일 다운로드 완료.');
  };

  const handleGenerateRandomKey = () => {
    const randKey = generateRandomHex(16);
    setSecretKey(randKey);
    showToast(`🔑 무작위 비밀키(${randKey})가 생성되었습니다.`);
  };

  const handleGenerateRandomIv = () => {
    const randIv = generateRandomHex(8);
    setIvValue(randIv);
    showToast(`🎲 무작위 IV(${randIv})가 생성되었습니다.`);
  };

  if (!isOpen) return null;

  return (
    <div
      id="crypto-codec-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="crypto-codec-modal-container"
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-6xl h-[90vh] max-h-[94vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 pointer-events-none">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 dark:bg-sky-400/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                암/복호화 & 멀티 인코더 모듈
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 font-mono font-medium">
                </span>
              </h2>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-nowrap">
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-amber-500" />
              <span>클립보드 붙여넣기</span>
            </button>

            <button
              type="button"
              onClick={() => setRawInput('')}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>지우기</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadOutput}
              disabled={!activeOutput}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-sky-500" />
              <span>파일 다운로드</span>
            </button>

            <button
              type="button"
              onClick={handleCopyOutput}
              disabled={!activeOutput}
              className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>결과 복사</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ml-1 shrink-0"
              title="닫기 (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="px-6 py-2 bg-stone-100/70 dark:bg-[#181818] border-b border-stone-200 dark:border-stone-800 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
          {[
            { id: 'crypto' as const, label: '🔐 대칭키 암/복호화 (AES / DES / 3DES)', icon: Shield },
            { id: 'hash' as const, label: '⚡ 해시 & HMAC (MD5 / SHA-256 / SHA-512)', icon: Hash },
            { id: 'codec' as const, label: '🔤 멀티 인코딩 / 디코딩 (Base64 / Hex / URL)', icon: Binary },
          ].map((tab) => {
            const IconEl = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap border shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-sky-600 border-sky-500 text-white shadow-2xs'
                    : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                }`}
              >
                <IconEl className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Feature Specific Control Bar */}
        <div className="px-6 py-2.5 bg-stone-50/50 dark:bg-[#1c1c1c] border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          {activeTab === 'crypto' && (
            <div className="flex flex-wrap items-center gap-3 w-full">
              {/* Mode: Encrypt vs Decrypt */}
              <div className="flex bg-stone-200 dark:bg-stone-800 p-0.5 rounded-xl font-bold">
                <button
                  type="button"
                  onClick={() => setCryptoAction('encrypt')}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    cryptoAction === 'encrypt'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
                  }`}
                >
                  🔒 암호화 (Encrypt)
                </button>
                <button
                  type="button"
                  onClick={() => setCryptoAction('decrypt')}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    cryptoAction === 'decrypt'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
                  }`}
                >
                  🔓 복호화 (Decrypt)
                </button>
              </div>

              {/* Algorithm selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-stone-500 font-semibold">알고리즘:</span>
                <select
                  value={cryptoAlgo}
                  onChange={(e) => setCryptoAlgo(e.target.value as any)}
                  className="px-2.5 py-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold outline-none text-xs"
                >
                  <option value="AES-CBC">AES-CBC</option>
                  <option value="AES-GCM">AES-GCM</option>
                  <option value="AES-ECB">AES-ECB</option>
                  <option value="DES">DES</option>
                  <option value="3DES">Triple DES (3DES)</option>
                </select>
              </div>

              {/* Key Size selector for AES */}
              {cryptoAlgo.startsWith('AES') && (
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-500 font-semibold">키 크기:</span>
                  <select
                    value={keyBits}
                    onChange={(e) => setKeyBits(Number(e.target.value) as any)}
                    className="px-2.5 py-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold outline-none text-xs"
                  >
                    <option value={128}>128-bit (16 Bytes)</option>
                    <option value={192}>192-bit (24 Bytes)</option>
                    <option value={256}>256-bit (32 Bytes)</option>
                  </select>
                </div>
              )}

              {/* Secret Key Input & Random Gen */}
              <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                <span className="text-stone-500 font-semibold shrink-0">Secret Key:</span>
                <input
                  type="text"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="비밀키(Secret Key) 입력..."
                  className="flex-1 px-3 py-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 font-mono text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={handleGenerateRandomKey}
                  className="px-2.5 py-1 rounded-xl border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold hover:bg-sky-100 shrink-0 flex items-center gap-1"
                  title="32바이트 무작위 비밀키 생성"
                >
                  <Key className="w-3 h-3" />
                  <span>랜덤 Key</span>
                </button>
              </div>

              {/* IV Input & Random Gen */}
              <div className="flex items-center gap-1.5 min-w-[180px]">
                <span className="text-stone-500 font-semibold shrink-0">IV:</span>
                <input
                  type="text"
                  value={ivValue}
                  onChange={(e) => setIvValue(e.target.value)}
                  placeholder="초기화 벡터(IV)..."
                  className="w-32 px-2.5 py-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 font-mono text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={handleGenerateRandomIv}
                  className="px-2.5 py-1 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold hover:bg-amber-100 shrink-0 flex items-center gap-1"
                  title="무작위 IV 생성"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>랜덤 IV</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'hash' && (
            <div className="flex flex-wrap items-center gap-4 w-full">
              <div className="flex items-center gap-2">
                <span className="text-stone-500 font-semibold">해시 알고리즘:</span>
                {(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as const).map((algo) => (
                  <button
                    key={algo}
                    type="button"
                    onClick={() => setHashAlgo(algo)}
                    className={`px-3 py-1 rounded-xl font-bold transition-all border ${
                      hashAlgo === algo
                        ? 'bg-sky-600 border-sky-500 text-white shadow-xs'
                        : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {algo}
                  </button>
                ))}
              </div>

              {/* HMAC Mode Toggle */}
              <label className="flex items-center gap-2 cursor-pointer font-bold text-stone-700 dark:text-stone-200 border-l border-stone-300 dark:border-stone-700 pl-3">
                <input
                  type="checkbox"
                  checked={isHmac}
                  onChange={(e) => setIsHmac(e.target.checked)}
                  className="rounded accent-sky-500 cursor-pointer"
                />
                <span>HMAC 서명 모드 사용</span>
              </label>

              {isHmac && (
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <span className="text-stone-500 font-semibold shrink-0">HMAC Secret:</span>
                  <input
                    type="text"
                    value={hmacSecret}
                    onChange={(e) => setHmacSecret(e.target.value)}
                    placeholder="HMAC Secret Key..."
                    className="flex-1 px-3 py-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 font-mono text-xs outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'codec' && (
            <div className="flex flex-wrap items-center gap-3 w-full">
              {/* Action: Encode vs Decode */}
              <div className="flex bg-stone-200 dark:bg-stone-800 p-0.5 rounded-xl font-bold">
                <button
                  type="button"
                  onClick={() => setCodecAction('encode')}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    codecAction === 'encode'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-300'
                  }`}
                >
                  ⚡ 인코딩 (Encode)
                </button>
                <button
                  type="button"
                  onClick={() => setCodecAction('decode')}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    codecAction === 'decode'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-300'
                  }`}
                >
                  🔍 디코딩 (Decode)
                </button>
              </div>

              {/* Codec Type Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'base64' as const, label: 'Base64 (Standard)' },
                  { id: 'url_base64' as const, label: 'Base64 (URL-Safe)' },
                  { id: 'hex' as const, label: 'Hex (16진수)' },
                  { id: 'url' as const, label: 'URL Encode' },
                  { id: 'html_entity' as const, label: 'HTML Entity' },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setCodecType(type.id)}
                    className={`px-3 py-1 rounded-xl font-bold transition-all border ${
                      codecType === type.id
                        ? 'bg-sky-600 border-sky-500 text-white shadow-xs'
                        : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Split Screen Body (2-Column Layout) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800 overflow-hidden bg-stone-50/40 dark:bg-[#141414]/40">
          {/* Left Column: Raw Input */}
          <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-sky-500" />
                <span>원본 데이터 (Input Text)</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-[10px] font-bold text-stone-600 dark:text-stone-300 flex items-center gap-1"
                >
                  <Upload className="w-3 h-3 text-sky-500" />
                  <span>파일 읽기</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => setRawInput(SAMPLE_TEXT)}
                  className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-bold"
                >
                  💡 샘플 채우기
                </button>
                <span className="font-mono text-[11px] text-stone-400">
                  {rawInput.length.toLocaleString()} 글자
                </span>
              </div>
            </div>

            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="암복호화, 해시, 또는 인코딩/디코딩할 텍스트를 입력하거나 파일에서 불러오세요..."
              className="flex-1 w-full p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] text-stone-900 dark:text-stone-100 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-sky-500 focus:border-sky-500 focus:outline-hidden transition-all resize-none custom-scrollbar"
              spellCheck={false}
            />
          </div>

          {/* Right Column: Computed Result */}
          <div className="flex flex-col h-full p-4 overflow-hidden relative">
            {/* Center Swap Button Floating in Between */}
            <button
              type="button"
              onClick={handleSwapInputOutput}
              disabled={!activeOutput}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md flex items-center gap-1 transition-transform active:scale-95 disabled:opacity-40 cursor-pointer"
              title="원본 입력과 결과를 서로 스왑(⇄)합니다"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>양방향 스왑 ⇄</span>
            </button>

            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span>처리 결과 (Computed Result)</span>
              </span>
              <span className="font-mono text-[11px] text-stone-400">
                {activeOutput ? activeOutput.length.toLocaleString() : 0} 글자
              </span>
            </div>

            <div className="flex-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] overflow-y-auto p-4 font-mono text-xs leading-relaxed custom-scrollbar relative">
              {activeOutput ? (
                <pre className="m-0 p-0 bg-transparent text-stone-800 dark:text-[#f1f5f9] font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {activeOutput}
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-stone-400">
                  <Wand2 className="w-8 h-8 mb-2 opacity-30 text-sky-500" />
                  <p className="text-xs">왼쪽 입력창에 데이터를 입력하면 실시간으로 처리 결과가 표시됩니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/80 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span>💡 </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold text-xs transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
