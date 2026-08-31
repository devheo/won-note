import React, { useState, useRef, useEffect } from 'react';
import { ColumnOption } from '../../types';
import { Plus, Check, Edit2, Tag } from 'lucide-react';
import { cleanTextValue } from '../../utils/textSanitizer';

interface SelectOrCustomInputProps {
  value: any;
  options?: ColumnOption[];
  onChange: (val: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  size?: 'sm' | 'md';
}

export const SelectOrCustomInput: React.FC<SelectOrCustomInputProps> = ({
  value,
  options = [],
  onChange,
  onBlur,
  placeholder = '분류 선택 또는 입력...',
  className = '',
  autoFocus = false,
  size = 'sm',
}) => {
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customText, setCustomText] = useState(cleanTextValue(value));
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const cleanVal = cleanTextValue(value);

  // If current value is not in option list, allow display
  const matchingOption = options.find((o) => o.id === cleanVal || o.label === cleanVal);

  useEffect(() => {
    setCustomText(cleanTextValue(value));
  }, [value]);

  useEffect(() => {
    if (isCustomMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isCustomMode]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === '__CUSTOM_INPUT_MODE__') {
      setIsCustomMode(true);
    } else {
      onChange(selected);
    }
  };

  const handleCustomSubmit = () => {
    const trimmed = cleanTextValue(customText);
    onChange(trimmed);
    setIsCustomMode(false);
    if (onBlur) onBlur();
  };

  if (isCustomMode) {
    return (
      <div className={`flex items-center gap-1 w-full ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={customText}
          placeholder="분류/상태 직접 입력..."
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCustomSubmit();
            }
            if (e.key === 'Escape') {
              setIsCustomMode(false);
              if (onBlur) onBlur();
            }
          }}
          onBlur={handleCustomSubmit}
          className={`flex-1 bg-white dark:bg-[#1f1f1f] border border-amber-500 rounded px-1.5 py-0.5 text-xs text-stone-900 dark:text-[#ffffff] outline-none ${
            size === 'md' ? 'px-2.5 py-1.5' : ''
          }`}
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCustomSubmit();
          }}
          className="p-1 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded text-xs font-bold"
          title="입력 완료"
        >
          <Check className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 w-full ${className}`}>
      <select
        ref={selectRef}
        autoFocus={autoFocus}
        value={cleanVal}
        onChange={handleSelectChange}
        onBlur={onBlur}
        className={`flex-1 bg-white dark:bg-[#242424] border border-amber-500/80 rounded px-1.5 py-0.5 outline-none text-xs text-stone-900 dark:text-[#ffffff] ${
          size === 'md' ? 'px-2.5 py-1.5 rounded-lg' : ''
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.label || opt.id} className="dark:bg-[#1f1f1f]">
            {opt.label}
          </option>
        ))}
        {cleanVal && !matchingOption && (
          <option value={cleanVal} className="dark:bg-[#1f1f1f]">
            {cleanVal} (직접 입력됨)
          </option>
        )}
        <option value="__CUSTOM_INPUT_MODE__" className="font-semibold text-amber-600 dark:text-amber-400">
          ✏️ [직접 입력...]
        </option>
      </select>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsCustomMode(true);
        }}
        className="p-1 text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-stone-100 dark:hover:bg-[#333333] rounded transition-colors"
        title="직접 텍스트로 입력하기"
      >
        <Edit2 className="w-3 h-3" />
      </button>
    </div>
  );
};
