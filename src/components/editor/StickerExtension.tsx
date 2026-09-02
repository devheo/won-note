import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState } from 'react';
import { CheckCircle2, Circle, Pin, Trash2, Palette } from 'lucide-react';

export interface StickerAttributes {
  id: string;
  title: string;
  color: 'yellow' | 'amber' | 'green' | 'blue' | 'rose' | 'purple';
  completed: boolean;
  pinned: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sticker: {
      /**
       * Insert a OneNote-style sticker note block
       */
      insertSticker: (attributes?: Partial<StickerAttributes>) => ReturnType;
    };
  }
}

/**
 * Color Themes for OneNote-style sticky notes
 */
const COLOR_STYLES: Record<string, { bg: string; border: string; text: string; header: string; tag: string }> = {
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-950/40',
    border: 'border-yellow-300 dark:border-yellow-700/60',
    text: 'text-yellow-950 dark:text-yellow-100',
    header: 'bg-yellow-200/70 dark:bg-yellow-900/50',
    tag: 'bg-yellow-300/80 text-yellow-900',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-950/40',
    border: 'border-amber-300 dark:border-amber-700/60',
    text: 'text-amber-950 dark:text-amber-100',
    header: 'bg-amber-200/70 dark:bg-amber-900/50',
    tag: 'bg-amber-300/80 text-amber-900',
  },
  green: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/40',
    border: 'border-emerald-300 dark:border-emerald-700/60',
    text: 'text-emerald-950 dark:text-emerald-100',
    header: 'bg-emerald-200/70 dark:bg-emerald-900/50',
    tag: 'bg-emerald-300/80 text-emerald-900',
  },
  blue: {
    bg: 'bg-sky-100 dark:bg-sky-950/40',
    border: 'border-sky-300 dark:border-sky-700/60',
    text: 'text-sky-950 dark:text-sky-100',
    header: 'bg-sky-200/70 dark:bg-sky-900/50',
    tag: 'bg-sky-300/80 text-sky-900',
  },
  rose: {
    bg: 'bg-rose-100 dark:bg-rose-950/40',
    border: 'border-rose-300 dark:border-rose-700/60',
    text: 'text-rose-950 dark:text-rose-100',
    header: 'bg-rose-200/70 dark:bg-rose-900/50',
    tag: 'bg-rose-300/80 text-rose-900',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-950/40',
    border: 'border-purple-300 dark:border-purple-700/60',
    text: 'text-purple-950 dark:text-purple-100',
    header: 'bg-purple-200/70 dark:bg-purple-900/50',
    tag: 'bg-purple-300/80 text-purple-900',
  },
};

/**
 * Interactive React View for the Sticker Node
 */
export const StickerComponent: React.FC<any> = ({ node, updateAttributes, deleteNode }) => {
  const { title = '꿀벌 스티커 메모', color = 'amber', completed = false, pinned = false } = node.attrs;
  const [showPalette, setShowPalette] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(title);

  const style = COLOR_STYLES[color] || COLOR_STYLES.amber;

  const handleTitleSubmit = () => {
    updateAttributes({ title: titleInput.trim() || '스티커 메모' });
    setIsEditingTitle(false);
  };

  const colorsList: Array<'amber' | 'yellow' | 'green' | 'blue' | 'rose' | 'purple'> = [
    'amber', 'yellow', 'green', 'blue', 'rose', 'purple'
  ];

  return (
    <NodeViewWrapper className="my-4 sticker-node-view select-none">
      <div
        className={`relative rounded-xl border ${style.border} ${style.bg} ${style.text} shadow-md overflow-hidden transition-all duration-200 hover:shadow-lg max-w-md`}
      >
        {/* Sticky Note Top Bar (OneNote Style Header) */}
        <div
          className={`flex items-center justify-between px-3 py-2 ${style.header} border-b ${style.border} cursor-move`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
            <button
              type="button"
              onClick={() => updateAttributes({ completed: !completed })}
              className="p-0.5 rounded hover:bg-black/10 transition-colors"
              title={completed ? '완료 취소' : '체크 완료'}
            >
              {completed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle className="w-4 h-4 opacity-60" />
              )}
            </button>

            {isEditingTitle ? (
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                autoFocus
                className="text-xs font-semibold bg-white/70 dark:bg-black/40 px-1.5 py-0.5 rounded border border-black/20 outline-none w-full"
              />
            ) : (
              <span
                onClick={() => setIsEditingTitle(true)}
                className={`text-xs font-bold truncate cursor-pointer hover:underline ${
                  completed ? 'line-through opacity-60' : ''
                }`}
                title="클릭하여 제목 변경"
              >
                {title || '스티커 메모'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Color Palette Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPalette(!showPalette)}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="스티커 색상 변경"
              >
                <Palette className="w-3.5 h-3.5 opacity-70" />
              </button>

              {showPalette && (
                <div className="absolute right-0 top-6 z-50 p-1.5 bg-stone-900 border border-stone-700 rounded-lg shadow-xl flex gap-1.5 animate-in fade-in">
                  {colorsList.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        updateAttributes({ color: c });
                        setShowPalette(false);
                      }}
                      className={`w-4 h-4 rounded-full border border-white/40 ${
                        c === 'amber' ? 'bg-amber-400' :
                        c === 'yellow' ? 'bg-yellow-300' :
                        c === 'green' ? 'bg-emerald-400' :
                        c === 'blue' ? 'bg-sky-400' :
                        c === 'rose' ? 'bg-rose-400' : 'bg-purple-400'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Pin Action */}
            <button
              type="button"
              onClick={() => updateAttributes({ pinned: !pinned })}
              className={`p-1 rounded hover:bg-black/10 transition-colors ${pinned ? 'text-amber-600 dark:text-amber-400' : 'opacity-60'}`}
              title={pinned ? '고정 해제' : '상단 고정'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>

            {/* Delete Action */}
            <button
              type="button"
              onClick={deleteNode}
              className="p-1 rounded hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors"
              title="스티커 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sticker Body Content */}
        <div className="p-3 text-xs leading-relaxed font-sans">
          <textarea
            value={node.attrs.body || ''}
            onChange={(e) => updateAttributes({ body: e.target.value })}
            placeholder="스티커에 남길 메모를 작성하세요..."
            rows={3}
            className="w-full bg-transparent resize-none border-none outline-none text-xs placeholder:opacity-40 leading-relaxed font-sans"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

/**
 * Custom TipTap Node Definition for Sticker
 */
export const StickerExtension = Node.create({
  name: 'sticker',
  group: 'block',
  content: '',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: () => `sticker-${Date.now().toString(36)}`,
      },
      title: {
        default: '꿀벌 스티커 🐝',
      },
      body: {
        default: '원노트 스타일 스티커 메모 내용입니다.',
      },
      color: {
        default: 'amber',
      },
      completed: {
        default: false,
      },
      pinned: {
        default: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="wonbee-sticker"]',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          const bodyEl = element.querySelector('.wonbee-sticker-content');
          const titleEl = element.querySelector('.wonbee-sticker-title');
          return {
            id: element.getAttribute('data-id') || `sticker-${Date.now().toString(36)}`,
            title: element.getAttribute('data-title') || titleEl?.textContent?.replace(/^[📌📝]\s*/, '') || '스티커 메모',
            body: element.getAttribute('data-body') || bodyEl?.textContent || '',
            color: element.getAttribute('data-color') || 'amber',
            completed: element.getAttribute('data-completed') === 'true',
            pinned: element.getAttribute('data-pinned') === 'true',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const title = HTMLAttributes.title || '스티커 메모';
    const body = HTMLAttributes.body || '';
    const color = HTMLAttributes.color || 'amber';
    const isCompleted = HTMLAttributes.completed === true || HTMLAttributes.completed === 'true';
    const isPinned = HTMLAttributes.pinned === true || HTMLAttributes.pinned === 'true';

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'wonbee-sticker',
        'data-id': HTMLAttributes.id,
        'data-title': title,
        'data-body': body,
        'data-color': color,
        'data-completed': isCompleted ? 'true' : 'false',
        'data-pinned': isPinned ? 'true' : 'false',
        class: `wonbee-sticker-element wonbee-sticker-${color} my-3 p-3.5 rounded-xl border shadow-sm max-w-md select-none`,
      }),
      [
        'div',
        { class: 'wonbee-sticker-header flex items-center justify-between pb-1.5 mb-2 border-b border-black/10 dark:border-white/10 font-bold text-xs' },
        ['span', { class: 'wonbee-sticker-title flex items-center gap-1.5' }, `${isPinned ? '📌 ' : '📝 '}${title}`],
        isCompleted ? ['span', { class: 'wonbee-sticker-done px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold' }, '✓ 완료'] : ['span', {}]
      ],
      [
        'div',
        { class: 'wonbee-sticker-content text-xs whitespace-pre-wrap leading-relaxed opacity-95' },
        body
      ]
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StickerComponent);
  },

  addCommands() {
    return {
      insertSticker:
        (attributes = {}) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              id: `sticker-${Date.now().toString(36)}`,
              title: attributes.title || '새 스티커 메모 🍯',
              body: attributes.title ? '' : '중요 아이디어 또는 체크리스트를 기록하세요.',
              color: attributes.color || 'amber',
              completed: false,
              pinned: false,
              ...attributes,
            },
          });
        },
    };
  },
});
