# Walkthrough - URL Encoder/Decoder in EncodingConverterModal

Added the **URL Encoder/Decoder (URL 인코더/디코더)** feature to `EncodingConverterModal.tsx`.

## Changes

### [URL Encoder/Decoder Feature]
#### [MODIFY] [EncodingConverterModal.tsx](file:///Users/nicsy/vsProjects/won-note/src/components/modals/EncodingConverterModal.tsx)
- **Mode Switcher Tabs**: Added `[ 🔄 인코딩 변환기 | 🔗 URL 인코더/디코더 ]` tabs in the modal header.
- **Real-time URL Encode & Decode**: When switched to URL mode, inputting text or URL-encoded strings instantly computes and displays both `encodeURIComponent` (Encoded) and `decodeURIComponent` (Decoded) results side-by-side with individual copy buttons.
- **Robust Fallback Copy**: Leverages clipboard writeText with document.execCommand fallback.

## Verification Results

### Automated Tests & Build
- `npm run lint` (`tsc --noEmit`): Passed with **0 errors**.
- `npm run build`: **Success (Exit Code 0)**. Single-file bundle generated successfully.
