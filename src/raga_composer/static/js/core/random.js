export function seedToUint32(seed) {
  if (seed === null || seed === undefined) return 0;
  return Number(seed) >>> 0;
}

export class Random {
  constructor(seed) {
    this.state = seedToUint32(seed);
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  randrange(n) {
    return Math.floor(this.next() * n);
  }

  choice(items) {
    return items[this.randrange(items.length)];
  }

  choices(items, weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) return this.choice(items);
    let cursor = this.next() * total;
    for (let index = 0; index < items.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) return items[index];
    }
    return items.at(-1);
  }
}

export function crc32(text) {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i);
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
