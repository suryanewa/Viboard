const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

// Keep the original encoded bytes. Canvas re-encoding was CPU-heavy and
// silently converted large PNGs to lossy JPEGs, changing both pixels and alpha.
export const fileToBoardImageDataUrl = (file: File): Promise<string> =>
  readFileAsDataUrl(file);
