export const TEXT_BLOCK_VERTICAL_PADDING = 16;
export const TEXT_BLOCK_LINE_HEIGHT_RATIO = 1.3;
export const TEXT_BLOCK_MIN_HEIGHT = 24;

export const getTextBlockLineHeight = (fontSize: number) =>
  Math.ceil(fontSize * TEXT_BLOCK_LINE_HEIGHT_RATIO);

export const getTextBlockHeight = (fontSize: number) =>
  Math.max(TEXT_BLOCK_MIN_HEIGHT, getTextBlockLineHeight(fontSize) + TEXT_BLOCK_VERTICAL_PADDING);
