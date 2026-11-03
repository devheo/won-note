# Implementation Plan: Semantic Text Content Diff Mode in FileDiffModal.tsx

Implement a new **"Semantic Text Content Diff" (텍스트 내용만 비교)** mode in `FileDiffModal.tsx` that compares text existence regardless of line number shifts or positions.

## User Review Required

> [!IMPORTANT]
> 1. **Diff Mode Toggle (`diffMode`)**: Add a mode selector `[ 📄 줄 단위 비교  |  🔤 텍스트 내용만 비교 ]` in the options toolbar.
> 2. **Semantic Text Diff Algorithm**: In `semantic` mode, text content existence is evaluated independently of line position offsets. Content is categorized into:
>    - **Common Content** (present in both A and B, even if line positions moved)
>    - **Deleted Content** (present in A, absent in B)
>    - **Added Content** (present in B, absent in A)
> 3. **Clean UI without Offset Gaps**: Eliminates artificial empty row padding caused by line number shifts.

## Open Questions

- None.

## Proposed Changes

### [Component Enhancement]

#### [MODIFY] [FileDiffModal.tsx](file:///Users/nicsy/vsProjects/won-note/src/components/modals/FileDiffModal.tsx)
- Add state `diffMode`: `'line' | 'semantic'` (default `'semantic'` or user toggleable).
- Add mode switch buttons in top toolbar: `[ 📄 줄 단위 비교  |  🔤 텍스트 내용만 비교 ]`.
- Implement `semanticRows` computation using line frequency/multiset analysis:
  - For each line in A, if it exists in B's line multiset, treat as common (match); otherwise treat as deleted in A.
  - For each line in B, if it exists in A's line multiset, treat as common (match); otherwise treat as added in B.
- Render side-by-side or unified view without artificial empty padding rows in `semantic` mode.

## Verification Plan

### Automated Tests
- Run `npm run lint` (`tsc --noEmit`) to verify 0 TypeScript errors.
- Run `npm run build` to verify successful production build.

### Manual Verification
- Open Diff modal, paste text where paragraphs/lines were moved around to different line numbers.
- Switch to `🔤 텍스트 내용만 비교` mode and verify that moved text is correctly recognized as common/existing, and only truly deleted or added text is highlighted.
