// Reads which resource types a Windows exe carries, such as its icon and
// version details, from the PE resource directory.

export const RT_ICON = 3;
export const RT_GROUP_ICON = 14;
export const RT_VERSION = 16;

const RESOURCE_DIRECTORY = 2;

/** Returns the numeric resource type IDs in a PE file's top-level resource directory. */
export function windowsResourceTypes(buffer) {
  if (buffer.toString("latin1", 0, 2) !== "MZ") throw new Error("Not a Windows executable.");
  const pe = buffer.readUInt32LE(0x3c);
  if (buffer.toString("latin1", pe, pe + 4) !== "PE\0\0") throw new Error("Missing PE header.");

  const coff = pe + 4;
  const sectionCount = buffer.readUInt16LE(coff + 2);
  const optionalSize = buffer.readUInt16LE(coff + 16);
  const optional = coff + 20;
  const magic = buffer.readUInt16LE(optional);
  const directories = optional + (magic === 0x20b ? 112 : 96);
  const resourceRva = buffer.readUInt32LE(directories + RESOURCE_DIRECTORY * 8);
  if (!resourceRva) return [];

  const sections = optional + optionalSize;
  let resource = -1;
  for (let index = 0; index < sectionCount; index += 1) {
    const section = sections + index * 40;
    const virtualSize = buffer.readUInt32LE(section + 8);
    const virtualAddress = buffer.readUInt32LE(section + 12);
    const rawSize = buffer.readUInt32LE(section + 16);
    const rawPointer = buffer.readUInt32LE(section + 20);
    const size = Math.max(virtualSize, rawSize);
    if (resourceRva >= virtualAddress && resourceRva < virtualAddress + size) {
      resource = rawPointer + (resourceRva - virtualAddress);
      break;
    }
  }
  if (resource < 0) throw new Error("Resource directory is outside every section.");

  const namedCount = buffer.readUInt16LE(resource + 12);
  const idCount = buffer.readUInt16LE(resource + 14);
  const types = [];
  for (let index = namedCount; index < namedCount + idCount; index += 1) {
    const name = buffer.readUInt32LE(resource + 16 + index * 8);
    if (!(name & 0x80000000)) types.push(name & 0xffff);
  }
  return types;
}
