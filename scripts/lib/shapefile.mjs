// Malé čtení archivu ZIP a souborů ESRI Shapefile (.dbf atributy, .shx rejstřík, .shp mnohoúhelníky) bez závislostí –
// pro GMBA Mountain Inventory (scripts/lib/mapa-tvary-gmba.mjs). Čte se po kusech (soubor .shp má stovky megabajtů).
import { openSync, readSync, closeSync, fstatSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const readAt = (fd, position, length) => {
    const buffer = Buffer.alloc(length);
    let done = 0;
    while (done < length) {
        const read = readSync(fd, buffer, done, length - done, position + done);
        if (!read) break;
        done += read;
    }
    return done === length ? buffer : buffer.subarray(0, done);
};

// Rozbalí z archivu soubory, pro které wanted(jméno) vrátí cílovou cestu (jinak null); bez ZIP64 a šifrování
export const unzipFiles = (zipPath, wanted) => {
    const fd = openSync(zipPath, 'r');
    try {
        const size = fstatSync(fd).size;
        const tail = readAt(fd, Math.max(0, size - 65557), Math.min(size, 65557));
        const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        if (end < 0) throw new Error(`${zipPath}: není archiv ZIP`);
        const count = tail.readUInt16LE(end + 10);
        const directory = readAt(fd, tail.readUInt32LE(end + 16), tail.readUInt32LE(end + 12));
        const written = [];
        for (let offset = 0, i = 0; i < count; i++) {
            if (directory.readUInt32LE(offset) !== 0x02014b50) throw new Error(`${zipPath}: poškozený adresář`);
            const method = directory.readUInt16LE(offset + 10);
            const compressed = directory.readUInt32LE(offset + 20);
            const nameLength = directory.readUInt16LE(offset + 28);
            const local = directory.readUInt32LE(offset + 42);
            const name = directory.toString('utf8', offset + 46, offset + 46 + nameLength);
            offset += 46 + nameLength + directory.readUInt16LE(offset + 30) + directory.readUInt16LE(offset + 32);
            const target = wanted(name);
            if (!target) continue;
            const header = readAt(fd, local, 30);
            const data = readAt(fd, local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28), compressed);
            if (method !== 0 && method !== 8) throw new Error(`${name}: nepodporovaná komprese ${method}`);
            writeFileSync(target, method === 8 ? inflateRawSync(data, { maxOutputLength: 2 ** 31 - 1 }) : data);
            written.push(target);
        }
        return written;
    } finally {
        closeSync(fd);
    }
};

// Atributy .dbf: pole objektů { pole: text } jen s vybranými poli (texty UTF-8, čísla jako text)
export const readDbf = (file, fields) => {
    const fd = openSync(file, 'r');
    try {
        const head = readAt(fd, 0, 32);
        const count = head.readUInt32LE(4), headerLength = head.readUInt16LE(8), recordLength = head.readUInt16LE(10);
        const descriptors = readAt(fd, 32, headerLength - 32);
        const columns = [];
        for (let offset = 0, position = 1; offset + 32 <= descriptors.length && descriptors[offset] !== 0x0d; offset += 32) {
            const name = descriptors.toString('latin1', offset, offset + 11).replace(/\0.*$/, '');
            const length = descriptors[offset + 16];
            if (!fields || fields.includes(name)) columns.push({ name, position, length });
            position += length;
        }
        const rows = [];
        const CHUNK = 500;
        for (let start = 0; start < count; start += CHUNK) {
            const n = Math.min(CHUNK, count - start);
            const block = readAt(fd, headerLength + start * recordLength, n * recordLength);
            for (let i = 0; i < n; i++) {
                const row = {};
                for (const column of columns) row[column.name] = block.toString('utf8', i * recordLength + column.position, i * recordLength + column.position + column.length).replace(/\0/g, '').trim();
                rows.push(row);
            }
        }
        return rows;
    } finally {
        closeSync(fd);
    }
};

// Mnohoúhelníky vybraných záznamů (pořadí od 0) ze souboru .shp podle rejstříku .shx: index → prstence [[lon, lat], …]
// (vnější po směru hodinových ručiček, díry proti směru – jak je shapefile ukládá)
export const readShpPolygons = (shpFile, shxFile, indexes) => {
    const shx = openSync(shxFile, 'r');
    const shp = openSync(shpFile, 'r');
    const result = new Map();
    try {
        for (const index of indexes) {
            const entry = readAt(shx, 100 + index * 8, 8);
            if (entry.length < 8) continue;
            const offset = entry.readUInt32BE(0) * 2, length = entry.readUInt32BE(4) * 2;
            const record = readAt(shp, offset + 8, length);
            const type = record.readInt32LE(0);
            if (![5, 15, 25].includes(type)) { result.set(index, []); continue; }
            const parts = record.readInt32LE(36), points = record.readInt32LE(40);
            const starts = [];
            for (let i = 0; i < parts; i++) starts.push(record.readInt32LE(44 + i * 4));
            starts.push(points);
            const base = 44 + parts * 4;
            const rings = [];
            for (let i = 0; i < parts; i++) {
                const ring = [];
                for (let p = starts[i]; p < starts[i + 1]; p++) ring.push([record.readDoubleLE(base + p * 16), record.readDoubleLE(base + p * 16 + 8)]);
                rings.push(ring);
            }
            result.set(index, rings);
        }
    } finally {
        closeSync(shx);
        closeSync(shp);
    }
    return result;
};
