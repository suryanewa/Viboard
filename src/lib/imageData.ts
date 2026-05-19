const MAX_BOARD_IMAGE_DIMENSION = 1600;
const BOARD_IMAGE_QUALITY = 0.82;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

const canvasToDataUrl = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<string> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(canvas.toDataURL(type, quality));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    }, type, quality);
  });

export const fileToBoardImageDataUrl = async (file: File): Promise<string> => {
  if (file.type === 'image/gif' || typeof createImageBitmap === 'undefined') {
    return readFileAsDataUrl(file);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_BOARD_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size <= 1_500_000) {
      return readFileAsDataUrl(file);
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) return readFileAsDataUrl(file);

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvasToDataUrl(canvas, 'image/jpeg', BOARD_IMAGE_QUALITY);
  } finally {
    bitmap.close();
  }
};
