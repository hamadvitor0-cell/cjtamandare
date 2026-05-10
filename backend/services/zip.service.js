const MAX_ZIP_BYTES = 80 * 1024 * 1024;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value) {
  const date = value ? new Date(value) : new Date();
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function sanitizeZipPath(value) {
  return String(value || "arquivo")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "arquivo";
}

function localHeader(entry, offset) {
  const header = Buffer.alloc(30);
  const name = Buffer.from(entry.name, "utf8");
  const { time, date } = dosDateTime(entry.createdAt);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.content.length, 18);
  header.writeUInt32LE(entry.content.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return { buffer: Buffer.concat([header, name]), offset };
}

function centralHeader(entry, offset) {
  const header = Buffer.alloc(46);
  const name = Buffer.from(entry.name, "utf8");
  const { time, date } = dosDateTime(entry.createdAt);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.content.length, 20);
  header.writeUInt32LE(entry.content.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name]);
}

function endRecord(entriesCount, centralSize, centralOffset) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entriesCount, 8);
  footer.writeUInt16LE(entriesCount, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

function documentFileName(documento, index) {
  const folder = sanitizeZipPath(`${documento.nome || "Aluno"}-${documento.cpf || documento.inscricaoId || index + 1}`);
  const original = sanitizeZipPath(documento.originalName || `documento-${index + 1}`);
  return `${folder}/${String(index + 1).padStart(2, "0")}-${original}`;
}

function createZip(documentos = []) {
  const entries = documentos
    .filter((documento) => documento?.fileContent)
    .map((documento, index) => {
      const content = Buffer.isBuffer(documento.fileContent)
        ? documento.fileContent
        : Buffer.from(documento.fileContent);
      return {
        name: documentFileName(documento, index),
        content,
        createdAt: documento.created_at,
        crc: crc32(content)
      };
    });

  const totalBytes = entries.reduce((total, entry) => total + entry.content.length + Buffer.byteLength(entry.name) + 76, 22);
  if (totalBytes > MAX_ZIP_BYTES) {
    const error = new Error("O ZIP ficou grande demais para gerar online. Use filtros por oficina ou aluno.");
    error.statusCode = 413;
    throw error;
  }

  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const local = localHeader(entry, offset);
    parts.push(local.buffer, entry.content);
    central.push(centralHeader(entry, offset));
    offset += local.buffer.length + entry.content.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(central);
  const footer = endRecord(entries.length, centralBuffer.length, centralOffset);
  return Buffer.concat([...parts, centralBuffer, footer]);
}

module.exports = {
  createZip,
  sanitizeZipPath
};
