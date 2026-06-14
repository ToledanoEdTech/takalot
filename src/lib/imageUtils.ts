const MAX_WIDTH = 500;
const MAX_HEIGHT = 500;
const JPEG_QUALITY = 0.5;
export const MAX_IMAGE_DATA_LENGTH = 120_000;

export function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('התמונה גדולה מדי (מעל 10MB).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('לא ניתן לקרוא את הקובץ.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('לא ניתן לעבד את התמונה.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('לא ניתן לעבד את התמונה.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        if (dataUrl.length > MAX_IMAGE_DATA_LENGTH) {
          reject(new Error('התמונה עדיין גדולה מדי לאחר דחיסה. נסו תמונה אחרת.'));
          return;
        }

        resolve(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
