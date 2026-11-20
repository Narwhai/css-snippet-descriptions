export class CssDescriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CssDescriptionError";
  }
}

interface DescriptionComment {
  readonly commentStart: number;
  readonly commentEnd: number;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly description: string;
}

interface HeaderScan {
  readonly comments: ReadonlyArray<DescriptionComment>;
  readonly insertionOffset: number;
  readonly newline: string;
  readonly hasFinalNewline: boolean;
  readonly bomLength: number;
}

const DESCRIPTION_COMMENT = /^\/\*[ \t]*@description:[ \t]*(.*?)[ \t]*\*\/$/;
const VALID_CHARSET = /^@charset[ \t]+"[^"\r\n]*"[ \t]*;/;

export function normalizeCssDescription(value: string): string {
  if (value.includes("\n") || value.includes("\r") || value.includes("\u2028") || value.includes("\u2029")) {
    throw new CssDescriptionError("Descriptions must be a single line.");
  }
  if (value.includes("*/")) {
    throw new CssDescriptionError("Descriptions cannot contain */.");
  }

  return value.trim();
}

export function readCssDescription(css: string): string | undefined {
  const header = scanHeader(css);
  return header.comments[0]?.description;
}

export function writeCssDescription(css: string, value: string): string {
  const description = normalizeCssDescription(value);
  const header = scanHeader(css);

  if (description.length === 0) {
    return removeDescriptionComments(css, header.comments);
  }

  if (header.comments.length > 0) {
    if (header.comments.every((comment) => comment.description === description)) {
      return css;
    }
    return replaceDescriptionComments(css, header.comments, description);
  }

  return insertDescription(css, header, description);
}

function scanHeader(css: string): HeaderScan {
  const bomLength = css.startsWith("\uFEFF") ? 1 : 0;
  let cursor = bomLength;
  const charsetMatch = VALID_CHARSET.exec(css.slice(cursor));
  if (charsetMatch !== null) {
    cursor += charsetMatch[0].length;
  }

  let headerEnd = cursor;
  const comments: DescriptionComment[] = [];
  while (cursor < css.length) {
    if (isCssWhitespace(css[cursor])) {
      cursor++;
      continue;
    }

    if (!css.startsWith("/*", cursor)) {
      break;
    }

    const commentStart = cursor;
    const commentClose = css.indexOf("*/", commentStart + 2);
    if (commentClose === -1) {
      throw new CssDescriptionError("Cannot edit the description because the leading CSS comment is not closed.");
    }
    const commentEnd = commentClose + 2;
    const lineStart = findLineStart(css, commentStart, bomLength);
    const lineContentEnd = skipHorizontalWhitespace(css, commentEnd);
    const lineEnd = includeLineEnding(css, lineContentEnd);
    const followingCharacter = css[lineContentEnd];
    const isStandalone = /^[ \t]*$/.test(css.slice(lineStart, commentStart))
      && (followingCharacter === undefined || followingCharacter === "\r" || followingCharacter === "\n");
    const commentText = css.slice(commentStart, commentEnd);
    const descriptionMatch = isStandalone ? DESCRIPTION_COMMENT.exec(commentText) : null;
    const description = descriptionMatch?.[1];

    if (typeof description === "string") {
      comments.push({ commentStart, commentEnd, lineStart, lineEnd, description: description.trim() });
    }

    cursor = commentEnd;
    headerEnd = commentEnd;
  }

  const newlineMatch = /\r\n|\n|\r/.exec(css);
  return {
    comments,
    // Leave indentation before the first rule with the rule, not with the new comment.
    insertionOffset: Math.max(headerEnd, findLineStart(css, cursor, bomLength)),
    newline: newlineMatch?.[0] ?? "\n",
    hasFinalNewline: css.endsWith("\n") || css.endsWith("\r"),
    bomLength,
  };
}

function isCssWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\n" || character === "\r" || character === "\f";
}

function findLineStart(css: string, offset: number, bomLength: number): number {
  let lineStart = offset;
  while (lineStart > bomLength) {
    const previous = css[lineStart - 1];
    if (previous === "\n" || previous === "\r") {
      break;
    }
    lineStart--;
  }
  return lineStart;
}

function skipHorizontalWhitespace(css: string, offset: number): number {
  let cursor = offset;
  while (css[cursor] === " " || css[cursor] === "\t") {
    cursor++;
  }
  return cursor;
}

function includeLineEnding(css: string, offset: number): number {
  if (css.startsWith("\r\n", offset)) {
    return offset + 2;
  }
  if (css[offset] === "\r" || css[offset] === "\n") {
    return offset + 1;
  }
  return offset;
}

function removeDescriptionComments(css: string, comments: ReadonlyArray<DescriptionComment>): string {
  if (comments.length === 0) {
    return css;
  }

  const output: string[] = [];
  let cursor = 0;
  for (const comment of comments) {
    output.push(css.slice(cursor, comment.lineStart));
    cursor = comment.lineEnd;
  }
  output.push(css.slice(cursor));
  return output.join("");
}

function replaceDescriptionComments(
  css: string,
  comments: ReadonlyArray<DescriptionComment>,
  description: string,
): string {
  const output: string[] = [];
  let cursor = 0;
  const replacement = `/* @description: ${description} */`;

  for (const comment of comments) {
    output.push(css.slice(cursor, comment.commentStart), replacement);
    cursor = comment.commentEnd;
  }
  output.push(css.slice(cursor));
  return output.join("");
}

function insertDescription(css: string, header: HeaderScan, description: string): string {
  const prefix = css.slice(0, header.insertionOffset);
  const suffix = css.slice(header.insertionOffset);
  const lastLineBreak = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("\r"));
  const currentLinePrefix = prefix.slice(lastLineBreak + 1).replace(/^\uFEFF/, "");
  const needsLeadingNewline = !/^[ \t]*$/.test(currentLinePrefix);
  const before = needsLeadingNewline ? header.newline : "";
  const after = suffix.length > 0 || header.hasFinalNewline ? header.newline : "";
  const comment = `/* @description: ${description} */`;

  return `${prefix}${before}${comment}${after}${suffix}`;
}
