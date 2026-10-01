#!/usr/bin/env python3
"""Build a source-only ZIP from an explicit allowlist; stdlib, Python 3.10+."""
from __future__ import annotations
import argparse
import hashlib
import re
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOP = 'dsh-tripo-blender'
MANIFEST = 'SHA256SUMS.txt'
FORBIDDEN_PARTS = {'.git', 'node_modules', 'secrets', 'credentials', 'private', 'data', 'projects', 'files', 'backups', 'validation', 'assets', 'models', 'textures', 'references', 'exports', '资产', '__pycache__'}
FORBIDDEN_EXTS = {'.blend', '.blend1', '.blend2', '.glb', '.gltf', '.fbx', '.obj', '.mtl', '.stl', '.ply', '.dae', '.usd', '.usda', '.usdc', '.usdz', '.abc', '.3mf', '.vrm', '.pmx', '.pmd', '.vmd', '.smd', '.dxf', '.3ds', '.max', '.ma', '.mb', '.c4d', '.zpr', '.ztl', '.bin', '.spp', '.sbsar', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tga', '.tif', '.tiff', '.hdr', '.exr', '.dds', '.ktx', '.ktx2', '.psd', '.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bak', '.pem', '.key', '.pfx', '.p12', '.log', '.tmp'}
FIXTURE = 'plugin/tests/fixtures/reference.png'
SECRET_PATTERNS = (
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b'),
    re.compile(rb'\bsk-[A-Za-z0-9_-]{24,}\b'),
    re.compile(rb'https?://[^\s/<>"\x27:]+:[^\s/<>"\x27]+@'),
)

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def validate_name(name: str) -> None:
    p = PurePosixPath(name)
    if not name or name != p.as_posix() or p.is_absolute() or '\\' in name or ':' in name or any(ord(c) < 32 for c in name) or any(part in {'..', '.'} for part in p.parts):
        raise ValueError(f'Unsafe relative path: {name!r}')
    if any(part.lower() in FORBIDDEN_PARTS for part in p.parts):
        raise ValueError(f'Private/generated path prohibited: {name}')
    low = p.name.lower()
    if low.startswith(('.env', 'id_rsa', 'id_ed25519')) or low in {'.npmrc', '.pypirc', '.netrc', 'state.json', 'storage-location.json'} or low.startswith('connection') and p.suffix.lower() == '.json':
        raise ValueError(f'Local configuration prohibited: {name}')
    if (p.suffix.lower() in FORBIDDEN_EXTS or re.search(r'\.blend\d*$', low)) and name != FIXTURE:
        raise ValueError(f'Model/image/archive/secret prohibited: {name}')
    if name.startswith('plugin/lib/') and name != 'plugin/lib/client-v0.3.4.js':
        raise ValueError(f'Historical build prohibited: {name}')

def validate_content(name: str, data: bytes) -> None:
    if name == FIXTURE:
        # The sole binary fixture is a non-personal, geometric 256x256 PNG.
        expected = '086cb5d45fd9a026f84ae266c606bc0c701baae934f47449b75a3a920ec68276'
        if sha256(data) != expected:
            raise ValueError('Test image changed; review provenance and update the reviewed fixture hash deliberately')
        return
    data.decode('utf-8-sig')  # No arbitrary binary files disguised as source.
    for index, pattern in enumerate(SECRET_PATTERNS, 1):
        for match in pattern.finditer(data):
            # One reviewed u:p URL in the SSRF rejection test, not a real credential.
            if index == 4 and name == 'plugin/tests/core.test.mjs' and match[0] == b'https://' + b'u:p@':
                continue
            raise ValueError(f'Potential secret pattern {index} in {name}; review without printing its value')

def collect(root: Path) -> dict[str, bytes]:
    names = [s.strip() for s in (root / 'tools/release-files.txt').read_text(encoding='utf-8').splitlines() if s.strip() and not s.startswith('#')]
    if names != sorted(set(names)) or MANIFEST in names:
        raise ValueError('Allowlist must be sorted, unique, and exclude the generated hash manifest')
    if 'tools/release-files.txt' not in names:
        raise ValueError('Allowlist must include itself')
    result = {}
    for name in names:
        validate_name(name)
        p = root / name
        if p.is_symlink() or any(parent.is_symlink() for parent in p.parents if parent != root.parent):
            raise ValueError(f'Symlink prohibited: {name}')
        if not p.is_file() or not p.resolve().is_relative_to(root.resolve()):
            raise ValueError(f'Missing/unsafe file: {name}')
        data = p.read_bytes()
        if len(data) > 20 * 1024 * 1024:
            raise ValueError(f'Unexpectedly large source file: {name}')
        validate_content(name, data)
        result[name] = data
    result[MANIFEST] = ''.join(f'{sha256(data)}  {name}\n' for name, data in result.items()).encode()
    return result

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('output', type=Path, help='New ZIP path outside the repository; never overwrite existing output')
    args = ap.parse_args()
    output = args.output.resolve()
    if output.suffix.lower() != '.zip' or output.is_relative_to(ROOT):
        ap.error('Output must be a .zip outside the source repository')
    sidecar = output.with_name(output.name + '.sha256')
    if output.exists() or sidecar.exists():
        ap.error('Output or hash sidecar already exists; choose a new filename')
    files = collect(ROOT)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(f'{TOP}/{name}', date_time=(2026, 9, 27, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        digest = sha256(output.read_bytes())
        with sidecar.open('x', encoding='utf-8', newline='\n') as f:
            f.write(f'{digest}  {output.name}\n')
    except Exception:
        # Keep any partial output for inspection; never replace an existing archive.
        raise
    print(f'Created {output.name}: {len(files)} files, {output.stat().st_size} bytes')
    print(f'SHA-256: {digest}')
    print('Allowlisted content only; no .git, dependencies, models or runtime data.')

if __name__ == '__main__':
    main()
