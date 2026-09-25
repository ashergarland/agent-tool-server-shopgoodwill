const namedEntities: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const decodeEntity = (entity: string): string => {
  const normalized = entity.toLowerCase();
  const named = namedEntities[normalized];
  if (named !== undefined) return named;

  const numeric = normalized.startsWith('#x')
    ? Number.parseInt(normalized.slice(2), 16)
    : normalized.startsWith('#')
      ? Number.parseInt(normalized.slice(1), 10)
      : Number.NaN;
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 0x10ffff) return ' ';
  if (numeric >= 0xd800 && numeric <= 0xdfff) return ' ';
  return String.fromCodePoint(numeric);
};

const promptLikeLine =
  /^(?:system|assistant|developer|tool|user)\s*:|(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|messages?)|(?:follow|obey|execute)\s+(?:these|the following)\s+instructions?/iu;

const replaceDisallowedControls = (value: string): string =>
  Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (codePoint >= 0 && codePoint <= 8) ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 127
      ? ' '
      : character;
  }).join('');

export const sanitizeUntrustedText = (input: unknown, maxLength: number): string | undefined => {
  if (typeof input !== 'string' || maxLength <= 0) return undefined;

  const withoutActiveContent = input
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(
      /<(script|style|template|noscript|svg|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
      ' ',
    )
    .replace(/<(?:br|\/?p|\/?div|\/?li|\/?tr|\/?h[1-6])\s*\/?>/giu, '\n')
    .replace(/<[^>]*>/gu, ' ');

  const decoded = withoutActiveContent.replace(
    /&([a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);?/giu,
    (_, entity) => decodeEntity(String(entity)),
  );

  const lines = replaceDisallowedControls(decoded)
    .split(/\r\n?|\n/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter((line) => line.length > 0 && !promptLikeLine.test(line));

  const text = lines.join('\n').trim();
  if (text.length === 0) return undefined;
  return text.length <= maxLength
    ? text
    : `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

export const sanitizeSingleLine = (input: unknown, maxLength: number): string | undefined => {
  const sanitized = sanitizeUntrustedText(input, maxLength);
  return sanitized?.replace(/\s*\n\s*/gu, ' ').trim();
};
