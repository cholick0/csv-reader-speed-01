// Fast drop-in for csv-reader 1.0.0: run(input) returns exactly what csv-reader
// returns for {text, header} -> {columns, rows, errors}.
//
// Same semantics as the reference (see the kit's vendor/csv-reader), reimplemented
// as a single left-to-right scan that slices field values out of the input instead
// of building them a character at a time:
//  - a U+FEFF at the very start is dropped;
//  - a record ends at LF or CRLF; a line left with no characters is no record;
//  - outside quotes a CR not followed by LF is dropped (stray_cr);
//  - a field opening with a quote runs to the next non-doubled quote, "" inside is
//    one quote, CRLF/lone CR inside is read as LF; what follows the closing quote
//    up to the next comma or line break is appended as it stands (quote_junk);
//    a quote that never closes is a literal character and the text after it is
//    read again as unquoted (unterminated_quote);
//  - a quote inside an unquoted field is a literal character; fields stay strings;
//  - columns is the first record when header is true, else null; rows are padded
//    (short_row, fields: count) or cut (long_row, extra: cut fields) to the first
//    record's width; errors are {code, line, row} in the order met, line the
//    1-based line the record starts on (every LF, CRLF and lone CR inside quotes
//    counted), row the record's index in rows (null for the header).
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;

    for (;;) {
      lastQuoted = text.charCodeAt(pos) === 34;
      let value;
      let added = 0;
      let junkCheck = false;
      let ended;

      if (lastQuoted) {
        // ---- quoted field: opening quote at pos ----
        const open = pos;
        const openLine = line;
        pos++;
        let segStart = pos;
        let parts = null;
        let closed = false;
        while (true) {
          const q = text.indexOf('"', pos);
          if (q === -1) break; // unterminated: handled below (closed stays false)
          // Count LFs in [pos, q) that are not the LF of a CRLF (a CRLF counts
          // once, through its CR below).
          let n = text.indexOf('\n', pos);
          while (n !== -1 && n < q) {
            if (text.charCodeAt(n - 1) !== 13) line++;
            n = text.indexOf('\n', n + 1);
          }
          // CRs in [pos, q): each becomes one LF in the value and one line.
          let s = pos;
          let cr = text.indexOf('\r', s);
          let dirty = false;
          while (cr !== -1 && cr < q) {
            dirty = true;
            if (parts === null) parts = [text.slice(s, cr)];
            else parts.push(text.slice(s, cr));
            parts.push('\n');
            line++;
            s = cr + (text.charCodeAt(cr + 1) === 10 ? 2 : 1);
            cr = text.indexOf('\r', s);
          }
          if (dirty) parts.push(text.slice(s, q));
          if (text.charCodeAt(q + 1) === 34) {
            // Doubled quote: one quote in the value.
            if (dirty) {
              parts.push('"');
            } else if (parts === null) {
              parts = [text.slice(segStart, q), '"'];
            } else {
              parts.push(text.slice(segStart, q), '"');
            }
            pos = q + 2;
            segStart = pos;
            continue;
          }
          // Closing quote.
          if (dirty) value = parts.join('');
          else if (parts === null) value = text.slice(segStart, q);
          else {
            parts.push(text.slice(segStart, q));
            value = parts.join('');
          }
          pos = q + 1;
          closed = true;
          break;
        }
        if (!closed) {
          // The quote never closes: literal character, text after it read again
          // as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          value = '"';
          // fall through to the unquoted scan below
        } else {
          if (pos >= len) {
            fields.push(value);
            ended = 2;
            break;
          }
          const c = text.charCodeAt(pos);
          if (c === 44) {
            pos++;
            fields.push(value);
            ended = 0;
            continue;
          }
          if (c === 10) {
            pos++;
            line++;
            fields.push(value);
            ended = 1;
            break;
          }
          if (c === 13 && text.charCodeAt(pos + 1) === 10) {
            pos += 2;
            line++;
            fields.push(value);
            ended = 1;
            break;
          }
          // What follows the closing quote is appended as it stands.
          junkCheck = true;
          // fall through to the unquoted scan below
        }
      } else {
        value = '';
        // fall through to the unquoted scan below
      }

      // ---- unquoted scan: appends onto `value` ('' for a plain field, the
      // quoted value for junk, '"' for an unterminated restart). `added`
      // counts the characters this scan appended, for quote_junk.
      let segStart = pos;
      let parts = null;
      ended = -1;
      while (pos < len) {
        const c = text.charCodeAt(pos);
        if (c === 44) {
          if (parts === null) {
            value += text.slice(segStart, pos);
            added += pos - segStart;
          } else {
            parts.push(text.slice(segStart, pos));
            added += pos - segStart;
            value += parts.join('');
          }
          pos++;
          ended = 0;
          break;
        }
        if (c === 10) {
          if (parts === null) {
            value += text.slice(segStart, pos);
            added += pos - segStart;
          } else {
            parts.push(text.slice(segStart, pos));
            added += pos - segStart;
            value += parts.join('');
          }
          pos++;
          line++;
          ended = 1;
          break;
        }
        if (c === 13) {
          if (text.charCodeAt(pos + 1) === 10) {
            if (parts === null) {
              value += text.slice(segStart, pos);
              added += pos - segStart;
            } else {
              parts.push(text.slice(segStart, pos));
              added += pos - segStart;
              value += parts.join('');
            }
            pos += 2;
            line++;
            ended = 1;
            break;
          }
          // A CR not followed by LF is dropped (stray_cr).
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          if (parts === null) parts = [text.slice(segStart, pos)];
          else parts.push(text.slice(segStart, pos));
          added += pos - segStart;
          pos++;
          segStart = pos;
          continue;
        }
        pos++;
      }
      if (ended === -1) {
        if (parts === null) {
          value += text.slice(segStart, pos);
          added += pos - segStart;
        } else {
          parts.push(text.slice(segStart, pos));
          added += pos - segStart;
          value += parts.join('');
        }
        ended = 2;
      }
      if (junkCheck && added > 0) {
        errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      }
      fields.push(value);
      if (ended !== 0) break;
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
