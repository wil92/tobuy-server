var crypto = require('crypto');

function itemId(section, name) {
  return crypto.createHash('sha256').update(section + '\0' + name).digest('hex').slice(0, 32);
}

function parse(text) {
  var section;
  var candidates = [];
  var counts = Object.create(null);
  var skipped = 0;
  var lines = text.split(/(?<=\n)/);
  var offset = 0;

  lines.forEach(function(line) {
    var content = line.replace(/\r?\n$/, '');
    var heading = /^##\s+(Periodic|Missing)\s*$/i.exec(content);
    if (heading) {
      section = heading[1].toLowerCase();
    } else if (/^#{1,6}\s/.test(content)) {
      section = undefined;
    } else {
      var match = section === 'periodic'
        ? /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(\S(?:.*\S)?)\s*$/.exec(content)
        : section === 'missing'
          ? /^\s*[-*+]\s+(?!\[)(\S(?:.*\S)?)\s*$/.exec(content)
          : null;
      if (match) {
        var name = section === 'periodic' ? match[4] : match[1];
        if (Buffer.byteLength(name, 'utf8') <= 64) {
          var id = itemId(section, name);
          counts[id] = (counts[id] || 0) + 1;
          candidates.push({
            id: id,
            name: name,
            section: section,
            needed: section === 'periodic' && match[2] === ' ',
            marker: section === 'periodic' ? offset + match[1].length : null
          });
        } else {
          skipped++;
        }
      } else if (/^\s*[-*+]\s+/.test(content)) {
        skipped++;
      }
    }
    offset += line.length;
  });

  var result = { periodic: [], missing: [], markers: Object.create(null), skipped: 0 };
  candidates.forEach(function(candidate) {
    if (counts[candidate.id] !== 1 || result.periodic.length + result.missing.length >= 64) {
      skipped++;
      return;
    }
    var item = { id: candidate.id, name: candidate.name };
    if (candidate.section === 'periodic') {
      item.needed = candidate.needed;
    }
    result[candidate.section].push(item);
    var snapshot = { type: 'list', revision: 4294967295, periodic: result.periodic, missing: result.missing };
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 8192) {
      result[candidate.section].pop();
      skipped++;
      return;
    }
    if (candidate.section === 'periodic') {
      result.markers[candidate.id] = candidate.marker;
    }
  });
  result.skipped = skipped;
  return result;
}

function setPeriodic(text, parsed, id, needed) {
  var marker = parsed.markers[id];
  if (marker === undefined) {
    return text;
  }
  return text.slice(0, marker) + (needed ? ' ' : 'x') + text.slice(marker + 1);
}

module.exports = { parse: parse, setPeriodic: setPeriodic };
