import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Calculator as CalcIcon,
  Delete,
  RotateCcw,
  History,
  Copy,
  Check,
  Trash2,
  Sparkles,
  ArrowRightLeft,
  Scale,
  Ruler,
  Thermometer,
} from 'lucide-react';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CalcMode = 'standard' | 'scientific' | 'converter';

const formatCalcResult = (value: number) => Number.isFinite(value)
  ? Number(value.toPrecision(15)).toString()
  : value.toString();

const sanitizeExpression = (value: string) => value
  .replace(/[−–—﹣－]/g, '-')
  .replace(/[^\d.+\-×÷*/%()\s]/g, '');

interface HistoryRecord {
  id: string;
  title?: string;
  expression: string;
  result: string;
  timestamp: number;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen, onClose }) => {
  const [calcMode, setCalcMode] = useState<CalcMode>('standard');
  const [displayValue, setDisplayValue] = useState<string>('0');
  const [expression, setExpression] = useState<string>('');
  const [editingHistoryExpression, setEditingHistoryExpression] = useState(false);
  const [memory, setMemory] = useState<number>(0);
  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('wonbee_calc_history');
      if (saved) {
        const records = JSON.parse(saved);
        if (Array.isArray(records)) return records.map(record => ({ ...record, title: typeof record.title === 'string' ? record.title : '' }));
      }
    } catch {}
    return [];
  });

  // Unit Converter States
  const [converterType, setConverterType] = useState<'length' | 'weight' | 'temp'>('length');
  const [fromVal, setFromVal] = useState<string>('1');
  const [fromUnit, setFromUnit] = useState<string>('m');
  const [toUnit, setToUnit] = useState<string>('cm');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleClear = () => {
    setDisplayValue('0');
    setExpression('');
  };

  const handleDigit = (digit: string) => {
    setDisplayValue((prev) => {
      if (prev === '0' || prev === 'Error') return digit;
      return prev + digit;
    });
  };

  const handleDecimal = () => {
    setDisplayValue((prev) => {
      if (prev.includes('.')) return prev;
      return prev + '.';
    });
  };

  const handleOperator = (op: string) => {
    setExpression((prev) => {
      const current = prev.trimEnd();
      if (/[+\-×÷%^]$/.test(current)) return `${current.slice(0, -1).trimEnd()} ${op}`.trimStart();
      if (editingHistoryExpression) return `(${current}) ${op}`.trim();
      return `${current} ${displayValue} ${op}`.trim();
    });
    setEditingHistoryExpression(false);
    setDisplayValue('0');
  };

  const handleScientificFunc = (funcName: string) => {
    try {
      const num = parseFloat(displayValue);
      let res = 0;
      let exprLabel = '';
      switch (funcName) {
        case 'sin':
          res = Math.sin((num * Math.PI) / 180);
          exprLabel = `sin(${num}°)`;
          break;
        case 'cos':
          res = Math.cos((num * Math.PI) / 180);
          exprLabel = `cos(${num}°)`;
          break;
        case 'tan':
          res = Math.tan((num * Math.PI) / 180);
          exprLabel = `tan(${num}°)`;
          break;
        case 'log':
          res = Math.log10(num);
          exprLabel = `log(${num})`;
          break;
        case 'ln':
          res = Math.log(num);
          exprLabel = `ln(${num})`;
          break;
        case 'sqrt':
          res = Math.sqrt(num);
          exprLabel = `√(${num})`;
          break;
        case 'sq':
          res = num * num;
          exprLabel = `${num}²`;
          break;
        case 'inv':
          res = 1 / num;
          exprLabel = `1/${num}`;
          break;
        case 'neg':
          res = -num;
          exprLabel = `-${num}`;
          break;
        default:
          return;
      }
      const rounded = formatCalcResult(res);
      setDisplayValue(rounded);
      addToHistory(exprLabel, rounded);
    } catch {
      setDisplayValue('Error');
    }
  };

  const handleConstant = (val: number, name: string) => {
    setDisplayValue(val.toString());
  };

  const handleMemory = (action: 'M+' | 'M-' | 'MR' | 'MC') => {
    const num = parseFloat(displayValue) || 0;
    if (action === 'M+') setMemory((m) => m + num);
    else if (action === 'M-') setMemory((m) => m - num);
    else if (action === 'MR') setDisplayValue(memory.toString());
    else if (action === 'MC') setMemory(0);
    showToast(`메모리 작업 [${action}] 완료 (M: ${memory})`);
  };

  const addToHistory = (expr: string, res: string) => {
    const newItem: HistoryRecord = {
      id: `calc-${Date.now()}`,
      title: '',
      expression: expr,
      result: res,
      timestamp: Date.now(),
    };
    setHistory((prev) => {
      const next = [newItem, ...prev].slice(0, 30);
      localStorage.setItem('wonbee_calc_history', JSON.stringify(next));
      return next;
    });
  };

  const updateHistoryTitle = (id: string, title: string) => {
    setHistory((prev) => {
      const next = prev.map(item => item.id === id ? { ...item, title } : item);
      localStorage.setItem('wonbee_calc_history', JSON.stringify(next));
      return next;
    });
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => {
      const next = prev.filter(item => item.id !== id);
      localStorage.setItem('wonbee_calc_history', JSON.stringify(next));
      return next;
    });
  };

  const handleCalculate = useCallback(() => {
    try {
      const fullExpr = sanitizeExpression(editingHistoryExpression ? expression : expression + ' ' + displayValue);
      if (!fullExpr.trim()) throw new Error('Empty expression');
      // Only numeric literals and calculator operators reach the evaluator.
      const sanitized = fullExpr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/%/g, '/100');

      // eslint-disable-next-line no-new-func
      const result = Function(`'use strict'; return (${sanitized})`)();
      const formatted = formatCalcResult(Number(result));

      addToHistory(fullExpr.trim(), formatted);
      setDisplayValue(formatted);
      setExpression('');
      setEditingHistoryExpression(false);
    } catch {
      setDisplayValue('Error');
    }
  }, [expression, displayValue, editingHistoryExpression]);

  // Keyboard shortcut support
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
        return;
      }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        handleDecimal();
      } else if (e.key === '+') {
        e.preventDefault();
        handleOperator('+');
      } else if (e.key === '-') {
        e.preventDefault();
        handleOperator('-');
      } else if (e.key === '*') {
        e.preventDefault();
        handleOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleCalculate();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setDisplayValue((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCalculate]);

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('wonbee_calc_history');
    showToast('✓ 계산기 히스토리가 삭제되었습니다.');
  };

  // Unit Converter Logic
  const convertUnits = useMemo(() => {
    const val = parseFloat(fromVal) || 0;
    if (converterType === 'length') {
      // Base unit: meters
      let meters = val;
      if (fromUnit === 'cm') meters = val / 100;
      else if (fromUnit === 'mm') meters = val / 1000;
      else if (fromUnit === 'km') meters = val * 1000;
      else if (fromUnit === 'inch') meters = val * 0.0254;
      else if (fromUnit === 'foot') meters = val * 0.3048;

      let result = meters;
      if (toUnit === 'cm') result = meters * 100;
      else if (toUnit === 'mm') result = meters * 1000;
      else if (toUnit === 'km') result = meters / 1000;
      else if (toUnit === 'inch') result = meters / 0.0254;
      else if (toUnit === 'foot') result = meters / 0.3048;

      return parseFloat(result.toFixed(6));
    } else if (converterType === 'weight') {
      // Base unit: grams
      let grams = val;
      if (fromUnit === 'kg') grams = val * 1000;
      else if (fromUnit === 'mg') grams = val / 1000;
      else if (fromUnit === 'lb') grams = val * 453.592;
      else if (fromUnit === 'oz') grams = val * 28.3495;

      let result = grams;
      if (toUnit === 'kg') result = grams / 1000;
      else if (toUnit === 'mg') result = grams * 1000;
      else if (toUnit === 'lb') result = grams / 453.592;
      else if (toUnit === 'oz') result = grams / 28.3495;

      return parseFloat(result.toFixed(6));
    } else if (converterType === 'temp') {
      // Celsius base
      let c = val;
      if (fromUnit === 'F') c = (val - 32) * (5 / 9);
      else if (fromUnit === 'K') c = val - 273.15;

      let result = c;
      if (toUnit === 'F') result = c * (9 / 5) + 32;
      else if (toUnit === 'K') result = c + 273.15;

      return parseFloat(result.toFixed(4));
    }
    return 0;
  }, [fromVal, fromUnit, toUnit, converterType]);

  const handleCopyResult = (txt: string) => {
    navigator.clipboard.writeText(txt);
    showToast('✓ 결과가 클립보드에 복사되었습니다.');
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      id="calculator-modal-backdrop"
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="calculator-modal-container"
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-4xl h-[85vh] max-h-[90vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 animate-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 pointer-events-none">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <CalcIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                스마트 공학 계산기 & 단위 변환기
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono font-medium">
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <div className="flex bg-stone-200 dark:bg-stone-800 p-0.5 rounded-xl font-bold text-xs">
              {[
                { id: 'standard' as const, label: '기본' },
                { id: 'scientific' as const, label: '공학용' },
                { id: 'converter' as const, label: '단위 변환' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCalcMode(m.id)}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    calcMode === m.id
                      ? 'bg-amber-500 text-stone-950 shadow-xs font-bold'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Split View: History Sidebar + Calculator Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* History Tape Sidebar */}
          <div className="w-64 border-r border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-[#181818] flex flex-col shrink-0 overflow-hidden">
            <div className="p-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs font-bold text-stone-700 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-amber-500" />
                계산 히스토리
              </span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="text-[10px] text-stone-400 hover:text-rose-500 font-normal"
                >
                  기록 삭제
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              {history.length === 0 ? (
                <div className="p-4 text-center text-stone-400 text-xs italic">
                  계산 기록이 없습니다.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setDisplayValue(item.result);
                      setExpression(item.expression);
                      setEditingHistoryExpression(true);
                      showToast('수식을 불러왔습니다. 위 수식란에서 수정한 뒤 계산하세요.');
                    }}
                    className="p-2 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#202020] hover:bg-amber-500/10 dark:hover:bg-amber-950/20 cursor-pointer transition-all group"
                  >
                    <input
                      value={item.title || ''}
                      maxLength={80}
                      placeholder="계산 제목 입력 (예: 월세 분담)"
                      aria-label="계산 기록 제목"
                      onClick={event => event.stopPropagation()}
                      onChange={event => updateHistoryTitle(item.id, event.target.value)}
                      className="mb-1 w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xs font-semibold text-stone-700 placeholder:font-normal placeholder:text-stone-400 hover:border-stone-200 focus:border-amber-400 focus:outline-none dark:text-stone-200 dark:hover:border-stone-700"
                    />
                    <div className="mb-1 px-1 py-1 text-[11px] font-mono text-stone-500 dark:text-stone-400">{item.expression}</div>
                    <div className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 truncate flex items-center justify-between">
                      <span className="min-w-0 flex-1">= {item.result}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyResult(item.result);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-stone-200"
                        title="결과 복사"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={event => { event.stopPropagation(); deleteHistoryItem(item.id); }}
                        className="ml-1 rounded p-0.5 text-stone-400 opacity-0 hover:text-rose-500 group-hover:opacity-100"
                        title="이 기록 삭제"
                        aria-label={`${item.title || item.expression} 기록 삭제`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Main Calculator Panel */}
          <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-stone-50/40 dark:bg-[#141414]">
            {calcMode === 'converter' ? (
              /* Unit Converter UI */
              <div className="max-w-xl mx-auto w-full space-y-5 my-auto">
                <div className="flex items-center justify-center gap-3">
                  {[
                    { id: 'length' as const, label: '길이 (Length)', icon: Ruler },
                    { id: 'weight' as const, label: '무게 (Weight)', icon: Scale },
                    { id: 'temp' as const, label: '온도 (Temperature)', icon: Thermometer },
                  ].map((t) => {
                    const IconEl = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setConverterType(t.id);
                          if (t.id === 'length') { setFromUnit('m'); setToUnit('cm'); }
                          else if (t.id === 'weight') { setFromUnit('kg'); setToUnit('g'); }
                          else if (t.id === 'temp') { setFromUnit('C'); setToUnit('F'); }
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                          converterType === t.id
                            ? 'bg-amber-500 border-amber-400 text-stone-950 shadow-sm'
                            : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        <IconEl className="w-4 h-4" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-lg">
                  {/* From */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-500">변환할 값:</label>
                    <input
                      type="number"
                      value={fromVal}
                      onChange={(e) => setFromVal(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-mono text-base outline-none focus:border-amber-500"
                    />
                    <select
                      value={fromUnit}
                      onChange={(e) => setFromUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-bold outline-none cursor-pointer"
                    >
                      {converterType === 'length' && (
                        <>
                          <option value="m">미터 (m)</option>
                          <option value="cm">센티미터 (cm)</option>
                          <option value="mm">밀리미터 (mm)</option>
                          <option value="km">킬로미터 (km)</option>
                          <option value="inch">인치 (in)</option>
                          <option value="foot">피트 (ft)</option>
                        </>
                      )}
                      {converterType === 'weight' && (
                        <>
                          <option value="kg">킬로그램 (kg)</option>
                          <option value="g">그램 (g)</option>
                          <option value="mg">밀리그램 (mg)</option>
                          <option value="lb">파운드 (lb)</option>
                          <option value="oz">온스 (oz)</option>
                        </>
                      )}
                      {converterType === 'temp' && (
                        <>
                          <option value="C">섭씨 (°C)</option>
                          <option value="F">화씨 (°F)</option>
                          <option value="K">켈빈 (K)</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* To */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-500">변환된 결과:</label>
                    <div className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-amber-50/50 dark:bg-amber-950/20 font-mono text-base font-bold text-amber-600 dark:text-amber-400 flex items-center justify-between">
                      <span>{convertUnits}</span>
                      <button
                        onClick={() => handleCopyResult(convertUnits.toString())}
                        className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500"
                        title="결과 복사"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <select
                      value={toUnit}
                      onChange={(e) => setToUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-bold outline-none cursor-pointer"
                    >
                      {converterType === 'length' && (
                        <>
                          <option value="m">미터 (m)</option>
                          <option value="cm">센티미터 (cm)</option>
                          <option value="mm">밀리미터 (mm)</option>
                          <option value="km">킬로미터 (km)</option>
                          <option value="inch">인치 (in)</option>
                          <option value="foot">피트 (ft)</option>
                        </>
                      )}
                      {converterType === 'weight' && (
                        <>
                          <option value="kg">킬로그램 (kg)</option>
                          <option value="g">그램 (g)</option>
                          <option value="mg">밀리그램 (mg)</option>
                          <option value="lb">파운드 (lb)</option>
                          <option value="oz">온스 (oz)</option>
                        </>
                      )}
                      {converterType === 'temp' && (
                        <>
                          <option value="C">섭씨 (°C)</option>
                          <option value="F">화씨 (°F)</option>
                          <option value="K">켈빈 (K)</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              /* Standard & Scientific Calculator UI */
              <div className="max-w-md mx-auto w-full flex flex-col h-full justify-center space-y-4">
                {/* Screen Display */}
                <div className="bg-stone-900 text-stone-100 p-4 rounded-2xl border border-stone-800 shadow-inner text-right space-y-1 font-mono">
                  <input aria-label="계산 수식" value={expression} onChange={event => setExpression(sanitizeExpression(event.target.value))} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); handleCalculate(); } }} placeholder="수식" className="w-full bg-transparent text-xs text-stone-400 min-h-[24px] truncate outline-none focus:text-stone-700 dark:focus:text-stone-200" />
                  <div className="text-3xl font-bold tracking-tight truncate">{displayValue}</div>
                </div>

                {/* Keypad Grid */}
                <div className={`grid gap-2 ${calcMode === 'scientific' ? 'grid-cols-5' : 'grid-cols-4'}`}>
                  {calcMode === 'scientific' && (
                    <>
                      <button type="button" onClick={() => handleScientificFunc('sin')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">sin</button>
                      <button type="button" onClick={() => handleScientificFunc('cos')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">cos</button>
                      <button type="button" onClick={() => handleScientificFunc('tan')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">tan</button>
                      <button type="button" onClick={() => handleScientificFunc('sqrt')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">√</button>
                      <button type="button" onClick={() => handleScientificFunc('sq')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">x²</button>

                      <button type="button" onClick={() => handleScientificFunc('log')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">log</button>
                      <button type="button" onClick={() => handleScientificFunc('ln')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">ln</button>
                      <button type="button" onClick={() => handleConstant(Math.PI, 'π')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">π</button>
                      <button type="button" onClick={() => handleConstant(Math.E, 'e')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">e</button>
                      <button type="button" onClick={() => handleOperator('^')} className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 font-bold text-xs transition-colors">x^y</button>

                      <button type="button" onClick={() => handleMemory('M+')} className="p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 font-bold text-xs transition-colors">M+</button>
                      <button type="button" onClick={() => handleMemory('M-')} className="p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 font-bold text-xs transition-colors">M-</button>
                      <button type="button" onClick={() => handleMemory('MR')} className="p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 font-bold text-xs transition-colors">MR</button>
                      <button type="button" onClick={() => handleMemory('MC')} className="p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 font-bold text-xs transition-colors">MC</button>
                      <button type="button" onClick={() => handleScientificFunc('inv')} className="p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 font-bold text-xs transition-colors">1/x</button>
                    </>
                  )}

                  <button type="button" onClick={handleClear} className="p-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-400 font-bold text-xs transition-colors">AC</button>
                  <button type="button" onClick={() => handleScientificFunc('neg')} className="p-3 rounded-xl bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 text-stone-700 dark:text-stone-300 font-bold text-xs transition-colors">±</button>
                  <button type="button" onClick={() => handleOperator('%')} className="p-3 rounded-xl bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 text-stone-700 dark:text-stone-300 font-bold text-xs transition-colors">%</button>
                  <button type="button" onClick={() => handleOperator('÷')} className="p-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 font-bold text-xs transition-colors">÷</button>
                  {calcMode === 'scientific' && <div />}

                  <button type="button" onClick={() => handleDigit('7')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">7</button>
                  <button type="button" onClick={() => handleDigit('8')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">8</button>
                  <button type="button" onClick={() => handleDigit('9')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">9</button>
                  <button type="button" onClick={() => handleOperator('×')} className="p-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 font-bold text-xs transition-colors">×</button>
                  {calcMode === 'scientific' && <div />}

                  <button type="button" onClick={() => handleDigit('4')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">4</button>
                  <button type="button" onClick={() => handleDigit('5')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">5</button>
                  <button type="button" onClick={() => handleDigit('6')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">6</button>
                  <button type="button" onClick={() => handleOperator('-')} className="p-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 font-bold text-xs transition-colors">-</button>
                  {calcMode === 'scientific' && <div />}

                  <button type="button" onClick={() => handleDigit('1')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">1</button>
                  <button type="button" onClick={() => handleDigit('2')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">2</button>
                  <button type="button" onClick={() => handleDigit('3')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">3</button>
                  <button type="button" onClick={() => handleOperator('+')} className="p-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 font-bold text-xs transition-colors">+</button>
                  {calcMode === 'scientific' && <div />}

                  <button type="button" onClick={() => handleDigit('0')} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs col-span-2">0</button>
                  <button type="button" onClick={handleDecimal} className="p-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 font-bold text-sm shadow-2xs">.</button>
                  <button type="button" onClick={handleCalculate} className="p-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm shadow-md">=</button>
                  {calcMode === 'scientific' && <div />}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/80 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span><strong></strong></span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold text-xs cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
