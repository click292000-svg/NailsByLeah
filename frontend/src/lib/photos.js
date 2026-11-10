import { config } from '../config'

/**
 * <img src> for a photo the API serves (a salon or profile photo). The server sends "/api/...?v=…" addresses; the
 * test-only backend sends the image itself as a data: URL, which wins when present.
 */
export const apiPhotoSrc = (url, dataUrl) =>
  dataUrl ?? (url ? `${config.apiBaseUrl.replace(/\/$/, '')}${url.replace(/^\/api/, '')}` : null)
