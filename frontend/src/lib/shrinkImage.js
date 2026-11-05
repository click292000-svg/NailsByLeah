// Phone photos are often several MB, far more than a design reference needs. Shrinking them in the browser means faster
// uploads on mobile data and many more photos fit in the storage plan.

const MAX_SIDE = 1600
const SMALL_ENOUGH_BYTES = 500 * 1024
const QUALITY = 0.82

/**
 * Returns a smaller JPEG copy of a large photo, or the original file when it is already small, when shrinking wouldn't
 * help, or when the browser can't do it (the server still checks every upload).
 */
export async function shrinkImage(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff' // JPEG has no transparency
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}
