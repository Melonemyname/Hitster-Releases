#!/usr/bin/env python3
"""
Importiert Spotify-Playlist-Exporte (CSV, z. B. von Exportify) in das Spiel:

- ergänzt neue Songs in src/assets/songs/hitster-song-metadata.csv
  (Spalten: trackId,title,artist,year,movie)
- schreibt pro Export eine .txt mit den Spotify-Track-Links nach src/assets/songs/

Die Metadaten-CSV ist zusätzlich nach Versionen unterteilt. Jede Sektion ist so
aufgebaut:

    ----------------------
    Versionstitel
    ----------------------

    <csv-Zeilen>

Diese Trennzeilen sind keine gültigen CSV-Zeilen (keine Track-ID) und werden
vom Spiel und vom Skript still ignoriert.

Hinweis: Die Songlisten werden zur Buildzeit ins Bundle eingebettet (Vite ?raw).
Neue Dateien müssen zusätzlich in src/assets/songs/index.js registriert werden,
danach die App neu bauen.

Erwartete Spalten im Export (Exportify-Format; Groß-/Kleinschreibung egal):
  "Track URI"           (oder "Track ID" / "Spotify ID" / "URI")
  "Track Name"          (oder "Name")
  "Artist Name(s)"      (oder "Artist Name")
  "Album Release Date"  (oder "Release Date")

Wichtig: Songs ohne Jahr werden im Spiel gefiltert – das Jahr wird deshalb aus
dem Release-Date übernommen.

Verwendung:
  python3 scripts/import_hitster_csvs.py <datei | ordner | glob> [...]
  python3 scripts/import_hitster_csvs.py export1.csv "~/Downloads/HITSTER*.csv"
  python3 scripts/import_hitster_csvs.py --dry-run playlists/
  python3 scripts/import_hitster_csvs.py --reorganize
  # ohne Argumente: alle *.csv aus scripts/spotify-exports/
"""
import argparse
import csv
import glob
import io
import os
import re

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS_DIR = os.path.join(WORKSPACE_ROOT, 'src', 'assets', 'songs')
MAIN_CSV = os.path.join(SONGS_DIR, 'hitster-song-metadata.csv')
DEFAULT_INPUT_DIR = os.path.join(WORKSPACE_ROOT, 'scripts', 'spotify-exports')

# 'movie'    = Film/Serie (nur für den Film-Modus; beim Import leer, separat gepflegt).
# 'ensemble' = Band/Solo (für den Bingo-Modus; beim Import leer, separat gepflegt).
# Beide bleiben als Spalten erhalten, damit die CSV konsistent ist.
METADATA_FIELDS = ['trackId', 'title', 'artist', 'year', 'movie', 'ensemble']

# ── Sektionen (Versionsunterteilung in der Metadaten-CSV) ────────────────
SECTION_RULE = '-' * 22
UNVERSIONED_LABEL = 'Ohne Version'
# Ein grober Filter für plausible Spotify-Track-IDs. Damit werden Sektions-
# Trennzeilen (z. B. "----------------------" oder "Versionstitel") beim
# Einlesen zuverlässig übersprungen.
SPOTIFY_ID_RE = re.compile(r'^[A-Za-z0-9]{15,}$')

# Anzeigenamen für die mitgelieferten Song-Listen. Muss zu STANDARD_VERSIONS in
# src/utils/versionsCatalog.js passen. Reihenfolge = Reihenfolge der Sektionen
# in der Metadaten-CSV (bei --reorganize).
VERSION_LABELS = [
    ('hitster-1.txt', 'Hitster Staffel 1'),
    ('hitster-2.txt', 'Hitster Staffel 2'),
    ('hitster-deutschland-rock.txt', 'Deutschland Rock'),
    ('hitster-espanol-rock.txt', 'Español Rock'),
    ('hitster-hungary-rock.txt', 'Hungary Rock'),
    ('hitster-nederlands-rock.txt', 'Nederlands Rock'),
    ('hitster-nordics-rock.txt', 'Nordics Rock'),
    ('hitster-polonia-rock.txt', 'Polonia Rock'),
    ('hitster-deutsch.txt', 'Deutsch'),
    ('hitster-deutschland-celebration.txt', 'Deutschland Celebration'),
    ('hitster-deutschland-soundtracks-expansion.txt',
     'Deutschland Soundtracks Expansion'),
    ('hitster-deutschland-christmas-expansion.txt',
     'Deutschland Christmas Expansion'),
    ('hitster-deutschland-guilty-pleasures.txt',
     'Deutschland Guilty Pleasures'),
    ('hitster-deutschland-summer-party.txt', 'Deutschland Summer Party'),
    ('hitster-deutschland-hip-hop.txt', 'Deutschland Urban & Hip-Hop'),
    ('hitster-schlager-party.txt', 'Schlager Party'),
    ('hitster-bingo-deutschland.txt', 'Bingo Deutschland'),
    ('hitster-bayern1-expansion.txt', 'Bayern1 Expansion'),
    ('hitster-platinum-edition.txt', 'Platinum Edition'),
    ('hitster-battle-generations-2005-2025.txt',
     'Battle of the Generations (2005-2025)'),
    ('hitster-battle-generations-1985-2004.txt',
     'Battle of the Generations (1985-2004)'),
    ('hitster-battle-generations-bis-1984.txt',
     'Battle of the Generations (bis 1984)'),
]
VERSION_LABEL_BY_FILE = dict(VERSION_LABELS)


def label_for_songlist(filename):
    """Liefert den Anzeigenamen für eine .txt-Songliste.

    Fällt für unbekannte Dateien auf einen aus dem Dateinamen abgeleiteten
    Titel zurück (z. B. "hitster-foo-bar.txt" -> "Foo Bar").
    """
    base = os.path.basename(filename)
    if base in VERSION_LABEL_BY_FILE:
        return VERSION_LABEL_BY_FILE[base]
    stem = re.sub(r'\.txt$', '', base, flags=re.I)
    stem = re.sub(r'^hitster[-_]?', '', stem, flags=re.I)
    stem = re.sub(r'[-_]+', ' ', stem).strip()
    return stem.title() if stem else base

# Mögliche Spaltennamen im Export (lowercase) -> logisches Feld.
COLUMN_ALIASES = {
    'track uri': 'track',
    'track id': 'track',
    'spotify id': 'track',
    'spotify track id': 'track',
    'uri': 'track',
    'track name': 'title',
    'name': 'title',
    'artist name(s)': 'artist',
    'artist name': 'artist',
    'artist names': 'artist',
    'artist': 'artist',
    'album release date': 'release_date',
    'release date': 'release_date',
}


def extract_track_id(value):
    value = (value or '').strip()
    if not value:
        return ''
    m = re.match(r'^spotify:track:([A-Za-z0-9]+)$', value, re.I)
    if m:
        return m.group(1)
    m = re.search(r'/track/([A-Za-z0-9]+)', value, re.I)
    if m:
        return m.group(1)
    return value


def extract_year(release_date):
    m = re.match(r'\s*(\d{4})', release_date or '')
    return m.group(1) if m else ''


def slugify_filename(name):
    name = name.lower()
    name = re.sub(r'\.csv$', '', name)
    name = re.sub(r'[^a-z0-9]+', '-', name)
    name = re.sub(r'-+', '-', name).strip('-')
    return (name or 'playlist') + '.txt'


def build_column_index(header):
    """Ordnet Export-Spalten (per Alias) logischen Feldern Spaltenindizes zu."""
    col_idx = {}
    for i, col in enumerate(header):
        logical = COLUMN_ALIASES.get((col or '').strip().lower())
        if logical and logical not in col_idx:
            col_idx[logical] = i
    return col_idx


def read_existing_trackids(path):
    ids = set()
    if not os.path.exists(path):
        return ids
    with open(path, newline='', encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            raw = (r.get('trackId') or r.get('trackid') or '').strip()
            if not raw or not SPOTIFY_ID_RE.match(raw):
                # Sektions-Trennzeilen (z. B. "----" oder "Versionstitel")
                # überspringen.
                continue
            tid = extract_track_id(raw)
            if tid:
                ids.add(tid)
    return ids


def process_export(csv_path):
    """Liest einen Spotify-Export -> (neue-Zeilen-Kandidaten, alle Links)."""
    entries = []
    links = []
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            return entries, links
        col_idx = build_column_index(header)
        if 'track' not in col_idx:
            raise ValueError(
                f"Keine Track-Spalte (z. B. 'Track URI') in "
                f"{os.path.basename(csv_path)} gefunden. Header: {header}"
            )

        def field(row, logical):
            i = col_idx.get(logical)
            return row[i].strip() if i is not None and i < len(row) else ''

        for row in reader:
            if not row:
                continue
            tid = extract_track_id(field(row, 'track'))
            if not tid:
                continue
            links.append(f'https://open.spotify.com/track/{tid}')
            entries.append({
                'trackId': tid,
                'title': field(row, 'title'),
                'artist': field(row, 'artist'),
                'year': extract_year(field(row, 'release_date')),
                'movie': '',
                'ensemble': '',
            })
    return entries, links


def collect_input_files(inputs):
    files = []
    for item in inputs:
        item = os.path.expanduser(item)
        if os.path.isdir(item):
            files.extend(sorted(glob.glob(os.path.join(item, '*.csv'))))
        elif os.path.isfile(item):
            files.append(item)
        else:
            files.extend(sorted(glob.glob(item)))
    seen = set()
    result = []
    for f in files:
        key = os.path.abspath(f)
        if key not in seen:
            seen.add(key)
            result.append(f)
    return result


def _row_to_csv_line(row):
    """Serialisiert eine Row-Dict-Zeile deterministisch (RFC-4180-konform)."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=METADATA_FIELDS,
                            lineterminator='\n')
    writer.writerow(row)
    return buffer.getvalue().rstrip('\n')


def _format_section_header(label):
    """Erzeugt den Sektionskopf inkl. Leerzeile davor und danach."""
    return (
        f'\n{SECTION_RULE}\n'
        f'{label}\n'
        f'{SECTION_RULE}\n'
        f'\n'
    )


def _split_metadata_file(path):
    """Zerlegt die CSV in Header + Sektionsliste.

    Rückgabe: (header_line, sections)
      - header_line: die "trackId,title,..."-Zeile (oder None, wenn Datei leer)
      - sections: Liste [(label, [csv_zeilen_ohne_umbruch])]
        Die erste Sektion trägt UNVERSIONED_LABEL, wenn Zeilen vor dem ersten
        Sektionskopf stehen.
    """
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return None, []

    with open(path, 'r', encoding='utf-8-sig', newline='') as f:
        raw_lines = f.read().split('\n')
    # trailing newline erzeugt beim split einen leeren Eintrag am Ende → weg.
    if raw_lines and raw_lines[-1] == '':
        raw_lines.pop()

    header_line = None
    if raw_lines:
        header_line = raw_lines[0]
        body = raw_lines[1:]
    else:
        body = []

    sections = []
    current_label = UNVERSIONED_LABEL
    current_rows = []
    i = 0
    while i < len(body):
        line = body[i]
        stripped = line.strip()
        # Sektionskopf-Erkennung: Trennlinie, Titelzeile, Trennlinie.
        if (
            stripped == SECTION_RULE
            and i + 2 < len(body)
            and body[i + 2].strip() == SECTION_RULE
        ):
            # Vorherige Sektion abschließen (nur wenn sie Inhalt hat).
            if current_rows:
                sections.append((current_label, current_rows))
            current_label = body[i + 1].strip() or UNVERSIONED_LABEL
            current_rows = []
            i += 3
            continue
        # Reine Leerzeilen zwischen Sektionen ignorieren.
        if stripped == '':
            i += 1
            continue
        current_rows.append(line)
        i += 1

    if current_rows:
        sections.append((current_label, current_rows))

    return header_line, sections


def _write_metadata_file(path, header_line, sections):
    """Schreibt CSV mit Header und Sektionen (Sektionen ohne Rows werden
    ausgelassen)."""
    header = header_line or ','.join(METADATA_FIELDS)
    parts = [header + '\n']
    for label, rows in sections:
        if not rows:
            continue
        parts.append(_format_section_header(label))
        parts.append('\n'.join(rows) + '\n')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(''.join(parts))


def append_metadata_sections(path, batches):
    """Fügt neue Zeilen pro Versionslabel in die Metadaten-CSV ein.

    batches: dict/OrderedDict label -> Liste von Row-Dicts.
    - Für vorhandene Sektionen werden die Zeilen ans Ende dieser Sektion gehängt.
    - Neue Labels werden am Ende der Datei als eigene Sektion angefügt.
    - Ist die CSV leer / hat keine Sektionen, wird Header + Sektion(en) neu
      geschrieben.
    """
    if not batches:
        return
    header_line, sections = _split_metadata_file(path)
    if header_line is None:
        header_line = ','.join(METADATA_FIELDS)

    section_index = {label: idx for idx, (label, _) in enumerate(sections)}
    for label, rows in batches.items():
        if not rows:
            continue
        new_lines = [_row_to_csv_line(row) for row in rows]
        if label in section_index:
            idx = section_index[label]
            existing_label, existing_rows = sections[idx]
            sections[idx] = (existing_label, existing_rows + new_lines)
        else:
            sections.append((label, new_lines))
            section_index[label] = len(sections) - 1

    _write_metadata_file(path, header_line, sections)


def reorganize_metadata(path, songs_dir):
    """Sortiert die bestehende Metadaten-CSV in Versions-Sektionen um.

    Zuordnung: jeder Song landet in der ersten Version (Reihenfolge aus
    VERSION_LABELS), deren .txt-Datei seine Track-ID enthält. Nicht zugeordnete
    Songs kommen in die Sektion "Ohne Version".
    """
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    # Alle Datenzeilen (ohne Sektionsköpfe) einsammeln.
    header_line, sections = _split_metadata_file(path)
    rows_by_id = {}
    order = []
    for _, csv_lines in sections:
        for line in csv_lines:
            fields = next(csv.reader([line]))
            # Auf METADATA_FIELDS-Länge normalisieren.
            fields = (fields + [''] * len(METADATA_FIELDS))[:len(METADATA_FIELDS)]
            row = dict(zip(METADATA_FIELDS, fields))
            tid = extract_track_id(row.get('trackId', ''))
            if not tid or not SPOTIFY_ID_RE.match(tid):
                continue
            row['trackId'] = tid
            if tid not in rows_by_id:
                rows_by_id[tid] = row
                order.append(tid)

    # Reihenfolge der Versionen + Track-IDs pro Datei lesen.
    ordered_labels = []
    seen_labels = set()
    trackids_by_label = {}
    for filename, label in VERSION_LABELS:
        songlist_path = os.path.join(songs_dir, filename)
        if not os.path.exists(songlist_path):
            continue
        if label not in seen_labels:
            ordered_labels.append(label)
            seen_labels.add(label)
        with open(songlist_path, 'r', encoding='utf-8') as f:
            ids = set()
            for line in f:
                line = line.strip()
                if not line:
                    continue
                tid = extract_track_id(line)
                if tid and SPOTIFY_ID_RE.match(tid):
                    ids.add(tid)
            trackids_by_label.setdefault(label, set()).update(ids)

    # Zuordnung: jede Track-ID zur ersten passenden Version.
    grouped = {label: [] for label in ordered_labels}
    unversioned = []
    for tid in order:
        assigned = None
        for label in ordered_labels:
            if tid in trackids_by_label.get(label, ()):
                assigned = label
                break
        if assigned:
            grouped[assigned].append(rows_by_id[tid])
        else:
            unversioned.append(rows_by_id[tid])

    # Sektionen als (label, [csv_zeilen])-Liste aufbauen.
    new_sections = []
    for label in ordered_labels:
        rows = grouped[label]
        if rows:
            new_sections.append((label, [_row_to_csv_line(r) for r in rows]))
    if unversioned:
        new_sections.append(
            (UNVERSIONED_LABEL, [_row_to_csv_line(r) for r in unversioned])
        )

    _write_metadata_file(path, header_line, new_sections)
    return {
        'total': len(rows_by_id),
        'assigned': sum(len(grouped[l]) for l in ordered_labels),
        'unversioned': len(unversioned),
        'sections': [(l, len(grouped[l])) for l in ordered_labels],
    }


def main():
    parser = argparse.ArgumentParser(
        description='Spotify-Playlist-Exporte in Hitster importieren.'
    )
    parser.add_argument(
        'inputs', nargs='*',
        help='CSV-Dateien, Ordner oder Glob-Muster. '
             'Ohne Angabe: scripts/spotify-exports/*.csv'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Nur anzeigen, nichts schreiben.')
    parser.add_argument(
        '--reorganize', action='store_true',
        help='Bestehende Metadaten-CSV nach Versionen sortieren '
             '(fügt Sektionsköpfe ein) und beenden.'
    )
    args = parser.parse_args()

    if args.reorganize:
        if args.dry_run:
            print('--dry-run wird bei --reorganize ignoriert.')
        stats = reorganize_metadata(MAIN_CSV, SONGS_DIR)
        print(f'Metadaten neu sortiert: {stats["total"]} Songs '
              f'({stats["assigned"]} in Versionen, '
              f'{stats["unversioned"]} ohne Version)')
        for label, count in stats['sections']:
            if count:
                print(f'  - {label}: {count}')
        return

    csv_files = collect_input_files(args.inputs or [DEFAULT_INPUT_DIR])
    if not csv_files:
        print('Keine CSV-Dateien gefunden.')
        print(f'Dateien/Ordner angeben oder Exporte in {DEFAULT_INPUT_DIR} ablegen.')
        return

    existing_ids = read_existing_trackids(MAIN_CSV)
    # OrderedDict verhält sich in Python 3.7+ wie dict (Insertion Order).
    rows_by_label = {}
    seen_new = set()
    missing_year = 0
    summary = []

    for path in csv_files:
        try:
            entries, links = process_export(path)
        except ValueError as err:
            print(f'ÜBERSPRUNGEN: {err}')
            continue

        outname = slugify_filename(os.path.basename(path))
        outpath = os.path.join(SONGS_DIR, outname)
        version_label = label_for_songlist(outname)

        added_here = 0
        for entry in entries:
            tid = entry['trackId']
            if tid in existing_ids or tid in seen_new:
                continue
            seen_new.add(tid)
            rows_by_label.setdefault(version_label, []).append(entry)
            added_here += 1
            if not entry['year']:
                missing_year += 1

        if not args.dry_run:
            with open(outpath, 'w', encoding='utf-8') as out:
                out.write('\n'.join(links))
                if links:
                    out.write('\n')
        summary.append((os.path.basename(path), outname, version_label,
                        len(links), added_here))
        prefix = '[dry-run] ' if args.dry_run else ''
        print(f'{prefix}{os.path.basename(path)} -> {outname} '
              f'(Sektion "{version_label}", '
              f'{len(links)} Links, {added_here} neu)')

    if rows_by_label and not args.dry_run:
        append_metadata_sections(MAIN_CSV, rows_by_label)

    total_new = sum(len(rows) for rows in rows_by_label.values())

    print('\nZusammenfassung:')
    for name, outname, label, links_count, added_here in summary:
        print(f'- {name}: {links_count} Links -> {outname} '
              f'[Sektion "{label}"], {added_here} neue Songs')
    print(f'\nNeue Songs gesamt: {total_new}')
    if missing_year:
        print(f'WARNUNG: {missing_year} neue Songs ohne Jahr '
              f'(werden im Spiel gefiltert!).')
    if args.dry_run:
        print('(dry-run - nichts geschrieben)')


if __name__ == '__main__':
    main()
