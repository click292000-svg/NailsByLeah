import { shrinkImage } from '../lib/shrinkImage'

const fileOf = (bytes, name = 'nails.png', type = 'image/png') => new File([new Uint8Array(bytes)], name, { type })

function stubBrowser({ width, height, outputBytes }) {
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })))
  const sizes = {}
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function context() {
    sizes.width = this.width
    sizes.height = this.height
    return { fillRect: vi.fn(), drawImage: vi.fn() }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done, type) => done(new Blob([new Uint8Array(outputBytes)], { type })))
  return { sizes, close }
}

describe('Shrinking photos before upload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('turns a large photo into a smaller JPEG, keeping its proportions', async () => {
    const { sizes, close } = stubBrowser({ width: 4000, height: 3000, outputBytes: 1000 })

    const result = await shrinkImage(fileOf(6 * 1024 * 1024))

    expect(result.type).toBe('image/jpeg')
    expect(result.name).toBe('nails.jpg')
    expect(result.size).toBe(1000)
    expect(sizes).toEqual({ width: 1600, height: 1200 })
    expect(close).toHaveBeenCalled()
  })

  it('leaves a photo that is already small alone', async () => {
    stubBrowser({ width: 800, height: 600, outputBytes: 10 })
    const original = fileOf(100 * 1024)

    expect(await shrinkImage(original)).toBe(original)
  })

  it('keeps the original when shrinking would not make it smaller', async () => {
    stubBrowser({ width: 4000, height: 3000, outputBytes: 2000 })
    const original = fileOf(1000)

    expect(await shrinkImage(original)).toBe(original)
  })

  it('keeps the original when the browser cannot read the image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('unsupported') }))
    const original = fileOf(6 * 1024 * 1024)

    expect(await shrinkImage(original)).toBe(original)
  })
})
