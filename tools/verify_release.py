#!/usr/bin/env python3
"""Verify an untouched release ZIP or extracted directory against its file hashes."""
from __future__ import annotations
import argparse
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile
import sys
sys.dont_write_bytecode = True
from package_release import MANIFEST, TOP, sha256, validate_content, validate_name

def load(target: Path) -> dict[str, bytes]:
    files = {}
    if target.is_dir():
        for p in target.rglob('*'):
            if p.is_symlink():
                raise ValueError(f'Symlink prohibited: {p.name}')
            if p.is_file():
                name = p.relative_to(target).as_posix()
                # Running this verifier must not change its own source snapshot.
                if '__pycache__' in p.parts:
                    raise ValueError('Use python -B when running the verifier, and remove only tool-generated __pycache__ before verifying an untouched snapshot')
                validate_name(name)
                files[name] = p.read_bytes()
    else:
        with zipfile.ZipFile(target) as z:
            for info in z.infolist():
                if info.is_dir() or stat.S_ISLNK(info.external_attr >> 16):
                    raise ValueError('Unexpected directory/symlink entry')
                if not info.filename.startswith(TOP + '/'):
                    raise ValueError('Unexpected archive root')
                name = info.filename[len(TOP) + 1:]
                validate_name(name)
                if name in files:
                    raise ValueError(f'Duplicate archive entry: {name}')
                if info.file_size > 20 * 1024 * 1024:
                    raise ValueError('Unexpectedly large archive entry')
                files[name] = z.read(info)  # Also verifies ZIP CRC.
    return files

def verify(target: Path) -> dict:
    files = load(target)
    if MANIFEST not in files:
        raise ValueError('Missing SHA256SUMS.txt')
    expected = {}
    for line in files[MANIFEST].decode('utf-8').splitlines():
        m = re.fullmatch(r'([a-f0-9]{64})  (.+)', line)
        if not m:
            raise ValueError('Malformed manifest line')
        digest, name = m.groups()
        validate_name(name)
        if name in expected or name == MANIFEST:
            raise ValueError('Duplicate/self-referencing manifest entry')
        expected[name] = digest
    if set(files) != set(expected) | {MANIFEST}:
        raise ValueError('Missing or unlisted files in snapshot')
    declared = [s.strip() for s in files['tools/release-files.txt'].decode().splitlines() if s.strip() and not s.startswith('#')]
    if declared != sorted(set(declared)) or set(declared) != set(expected):
        raise ValueError('Allowlist and manifest differ')
    for name, digest in expected.items():
        if sha256(files[name]) != digest:
            raise ValueError(f'Hash mismatch: {name}')
        validate_content(name, files[name])
    return {'files': len(files), 'content_bytes': sum(map(len, files.values())), 'model_files': 0, 'unexpected_files': 0, 'hashes': 'all matched'}

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('target', type=Path, nargs='?', default=Path(__file__).resolve().parents[1])
    args = ap.parse_args()
    import json
    print(json.dumps(verify(args.target), ensure_ascii=False, indent=2))
    print('Integrity verified. A hash manifest is not a digital signature or a guarantee of security.')

if __name__ == '__main__':
    main()
