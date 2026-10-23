// The image type a file actually holds, read from its leading bytes, so an
// upload's stored extension and served Content-Type never come from the
// client's file name or declared type. SVG is not recognized on purpose: it
// can carry script.

const BRANDS_AVIF = new Set(['avif', 'avis']);
const BRANDS_HEIC = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx']);
const BRANDS_HEIF = new Set(['mif1', 'msf1']);

const TYPES = {
    jpg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
    bmp: 'image/bmp',
};

// ISO base media (AVIF, HEIC): an ftyp box whose major or compatible
// brands name the format.
function isoImageExt(buffer) {
    if (buffer.subarray(4, 8).toString('latin1') !== 'ftyp') return null;
    const boxSize = Math.min(buffer.readUInt32BE(0), buffer.length);
    const brands = [buffer.subarray(8, 12).toString('latin1')];
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(buffer.subarray(i, i + 4).toString('latin1'));
    if (brands.some((b) => BRANDS_AVIF.has(b))) return 'avif';
    if (brands.some((b) => BRANDS_HEIC.has(b))) return 'heic';
    if (brands.some((b) => BRANDS_HEIF.has(b))) return 'heif';
    return null;
}

// { ext, mime } for a recognized image, or null.
function sniffImage(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    let ext = null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ext = 'jpg';
    else if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = 'png';
    else if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('latin1'))) ext = 'gif';
    else if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') ext = 'webp';
    else if (buffer[0] === 0x42 && buffer[1] === 0x4d) ext = 'bmp';
    else ext = isoImageExt(buffer);
    return ext ? { ext, mime: TYPES[ext] } : null;
}

const IMAGE_MIMES = new Set(Object.values(TYPES));

module.exports = { sniffImage, IMAGE_MIMES };
