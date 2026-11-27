export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 20_000_000;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be read"));
    image.src = url;
  });
}

export async function validateImageFile(file) {
  if (!file) return { valid: false, error: "Choose an image to scan." };

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { valid: false, error: "Use a JPEG, PNG or WebP image." };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { valid: false, error: "The image is larger than 5 MiB. Choose a smaller file." };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    if (image.width * image.height > IMAGE_MAX_PIXELS) {
      return { valid: false, error: "The image has too many pixels. Choose a smaller image." };
    }
    return { valid: true, width: image.width, height: image.height };
  } catch {
    return { valid: false, error: "That image could not be read. Try another file." };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
