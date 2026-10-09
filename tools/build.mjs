import {readdir, readFile, mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {deflateRawSync} from "node:zlib";

const root = path.resolve("src/right-to-speak");
const output = path.resolve("dist/right-to-speak.zip");

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(full));
    else if (entry.isFile()) result.push(full);
  }
  return result.sort();
}

const CRC_TABLE = Array.from({length: 256}, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(filename, contents, offset) {
  const name = Buffer.from(filename.replaceAll("\\", "/"), "utf8");
  const compressed = deflateRawSync(contents);
  const crc = crc32(contents);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(contents.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(contents.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  return {local: Buffer.concat([local, name, compressed]), central: Buffer.concat([central, name])};
}

const localParts = [];
const centralParts = [];
let offset = 0;
for (const filename of await files(root)) {
  const name = `right-to-speak/${path.relative(root, filename).replaceAll("\\", "/")}`;
  const contents = await readFile(filename);
  const entry = zipEntry(name, contents, offset);
  localParts.push(entry.local);
  centralParts.push(entry.central);
  offset += entry.local.length;
}
const central = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centralParts.length, 8);
end.writeUInt16LE(centralParts.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, Buffer.concat([...localParts, central, end]));
console.log(`${output}: ${centralParts.length} files`);
