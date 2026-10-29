// A minimal JPEG carrying the EXIF a camera writes: when the photo was taken
// (DateTimeOriginal) and where (GPS). Built here so the tests need no real
// photo. Only the EXIF is real; there is no image after it.

// Little-endian TIFF, the layout inside an EXIF block.
function tiff({ takenAt, latitude, longitude }) {
  const entries = { ifd0: [], exif: [], gps: [] };
  const data = []; // [placeholder entry, bytes] written after the IFDs

  const ascii = (text) => Buffer.from(`${text}\0`, 'latin1');
  const rationals = (value) => {
    const abs = Math.abs(value);
    const degrees = Math.floor(abs);
    const minutes = Math.floor((abs - degrees) * 60);
    const seconds = Math.round(((abs - degrees) * 60 - minutes) * 60 * 1000);
    const buf = Buffer.alloc(24);
    [[degrees, 1], [minutes, 1], [seconds, 1000]].forEach(([n, d], i) => {
      buf.writeUInt32LE(n, i * 8);
      buf.writeUInt32LE(d, i * 8 + 4);
    });
    return buf;
  };

  if (takenAt) entries.exif.push({ tag: 0x9003, type: 2, bytes: ascii(takenAt) });
  if (latitude != null) {
    entries.gps.push({ tag: 0x0001, type: 2, bytes: ascii(latitude < 0 ? 'S' : 'N') });
    entries.gps.push({ tag: 0x0002, type: 5, count: 3, bytes: rationals(latitude) });
    entries.gps.push({ tag: 0x0003, type: 2, bytes: ascii(longitude < 0 ? 'W' : 'E') });
    entries.gps.push({ tag: 0x0004, type: 5, count: 3, bytes: rationals(longitude) });
  }
  if (entries.exif.length) entries.ifd0.push({ tag: 0x8769, type: 4, pointer: 'exif' });
  if (entries.gps.length) entries.ifd0.push({ tag: 0x8825, type: 4, pointer: 'gps' });

  const ifdSize = (list) => 2 + list.length * 12 + 4;
  const offsets = { ifd0: 8 };
  offsets.exif = offsets.ifd0 + ifdSize(entries.ifd0);
  offsets.gps = offsets.exif + (entries.exif.length ? ifdSize(entries.exif) : 0);
  let dataOffset = offsets.gps + (entries.gps.length ? ifdSize(entries.gps) : 0);

  const parts = [];
  const header = Buffer.alloc(8);
  header.write('II', 0, 'latin1');
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(offsets.ifd0, 4);
  parts.push(header);

  for (const name of ['ifd0', 'exif', 'gps']) {
    const list = entries[name];
    if (name !== 'ifd0' && !list.length) continue;
    const buf = Buffer.alloc(ifdSize(list));
    buf.writeUInt16LE(list.length, 0);
    list.forEach((entry, i) => {
      const at = 2 + i * 12;
      buf.writeUInt16LE(entry.tag, at);
      buf.writeUInt16LE(entry.type, at + 2);
      if (entry.pointer) {
        buf.writeUInt32LE(1, at + 4);
        buf.writeUInt32LE(offsets[entry.pointer], at + 8);
      } else {
        buf.writeUInt32LE(entry.count || entry.bytes.length, at + 4);
        if (entry.bytes.length <= 4) {
          entry.bytes.copy(buf, at + 8);
        } else {
          buf.writeUInt32LE(dataOffset, at + 8);
          data.push(entry.bytes);
          dataOffset += entry.bytes.length;
        }
      }
    });
    buf.writeUInt32LE(0, buf.length - 4);
    parts.push(buf);
  }
  return Buffer.concat([...parts, ...data]);
}

/** JPEG bytes with the given EXIF; no options is a JPEG with none. */
function exifJpeg(options = {}) {
  const soi = Buffer.from([0xff, 0xd8]);
  const eoi = Buffer.from([0xff, 0xd9]);
  if (!options.takenAt && options.latitude == null) {
    // A JFIF header, as a photo with no EXIF starts.
    const jfif = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    return Buffer.concat([soi, jfif, eoi]);
  }
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff(options)]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([soi, app1, body, eoi]);
}

module.exports = { exifJpeg };
