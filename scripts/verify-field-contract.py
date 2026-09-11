#!/usr/bin/env python3
# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Static guard for contracts that span the frontend, the API and the handlers.

These contracts are invisible to typecheck, lint, cdk synth and security
scanning, because each side is individually valid. They only break at runtime,
in the browser, which is exactly where they are most expensive to find.

Contract 1 - POST /generate-text request fields
  The GenerateTextRequest model sets additionalProperties: false, so every
  field a page passes to TextGenerator as an `extraField` must appear in BOTH
  the model in cdk/lib/cdk-stack.ts AND ALLOWED_EXTRAS in text_gen.py.
  Missing from the model  -> API Gateway rejects the request with 400.
  Missing from the handler -> the value is silently dropped from the prompt.

Contract 2 - asset upload method
  assets.py issues a presigned POST policy, so AssetLibrary.jsx submits a
  multipart POST directly to Amazon S3. The asset bucket's CORS rule must
  therefore allow POST. If it allows only PUT, the browser blocks the upload
  on preflight and no server-side test notices.

Run from anywhere: python3 scripts/verify-field-contract.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
failures = []

# ------------------------------------------------------- Contract 1 --
# 1. What the frontend actually sends.
sent = {}
for page in sorted((ROOT / 'src' / 'pages').glob('*.jsx')):
    text = page.read_text(encoding='utf-8')
    if 'extraFields' not in text:
        continue
    ct = re.search(r'contentType="([a-z_]+)"', text)
    block = re.search(r'extraFields=\{\[(.*?)\]\}', text, re.S)
    if not block:
        continue
    for field in re.findall(r"name:\s*'([a-z_]+)'", block.group(1)):
        sent.setdefault(field, []).append(
            f'{page.name} (content_type={ct.group(1) if ct else "?"})'
        )

# 2. What the API Gateway model allows.
stack = (ROOT / 'cdk' / 'lib' / 'cdk-stack.ts').read_text(encoding='utf-8')
model_block = re.search(r"model\('GenerateTextRequest'.*?\n    \}\);", stack, re.S)
if not model_block:
    print('FAIL: could not locate the GenerateTextRequest model block', file=sys.stderr)
    sys.exit(1)
model_fields = set(re.findall(r'^\s{6}([a-z_]+):', model_block.group(0), re.M))
model_fields -= {'content_type', 'input'}   # required, not extras

# 3. What the handler forwards into the prompt.
handler = (ROOT / 'cdk' / 'lib' / 'lambda' / 'text-gen' / 'text_gen.py').read_text(encoding='utf-8')
extras_block = re.search(r'ALLOWED_EXTRAS\s*=\s*\{(.*?)\}', handler, re.S)
if not extras_block:
    print('FAIL: could not locate ALLOWED_EXTRAS in text_gen.py', file=sys.stderr)
    sys.exit(1)
allowed = set(re.findall(r"'([a-z_]+)'\s*:", extras_block.group(1)))

print('Contract 1: POST /generate-text request fields')
print(f'  frontend sends   ({len(sent)}): {", ".join(sorted(sent)) or "(none)"}')
print(f'  API model allows ({len(model_fields)}): {", ".join(sorted(model_fields)) or "(none)"}')
print(f'  handler forwards ({len(allowed)}): {", ".join(sorted(allowed)) or "(none)"}')

if not sent:
    failures.append('no extraFields were discovered at all - the frontend parser '
                    'is probably out of date with the pages')

for field in sorted(sent):
    if field not in model_fields:
        failures.append(f'"{field}" is sent by {sent[field]} but is MISSING from the '
                        f'GenerateTextRequest model -> API Gateway returns 400')
    if field not in allowed:
        failures.append(f'"{field}" is sent by {sent[field]} but is MISSING from '
                        f'ALLOWED_EXTRAS -> silently dropped from the prompt')

for field in sorted((model_fields | allowed) - set(sent)):
    print(f'  NOTE  "{field}" is permitted but no page sends it (harmless, but dead)')

drift = model_fields ^ allowed
if drift:
    failures.append('the API model and ALLOWED_EXTRAS disagree on: '
                    + ', '.join(sorted(drift)))

# ------------------------------------------------------- Contract 2 --
print()
print('Contract 2: asset upload method')
assets_py = (ROOT / 'cdk' / 'lib' / 'lambda' / 'assets' / 'assets.py').read_text(encoding='utf-8')
asset_page = (ROOT / 'src' / 'pages' / 'AssetLibrary.jsx').read_text(encoding='utf-8')

uses_presigned_post = 'generate_presigned_post' in assets_py
browser_posts = re.search(r"fetch\(\s*meta\.upload\.url\s*,\s*\{\s*method:\s*'POST'", asset_page)
cors_rule = re.search(r"allowedMethods:\s*bucket === assetBucket \? \[([^\]]*)\]", stack)
cors_methods = set(re.findall(r"'([A-Z]+)'", cors_rule.group(1))) if cors_rule else set()

print(f'  assets.py issues presigned POST: {uses_presigned_post}')
print(f'  browser uploads with POST:       {bool(browser_posts)}')
print(f'  asset bucket CORS allows:        {", ".join(sorted(cors_methods)) or "(unparsed)"}')

if not cors_rule:
    failures.append('could not parse the asset bucket CORS allowedMethods from cdk-stack.ts')
elif uses_presigned_post and bool(browser_posts) and 'POST' not in cors_methods:
    failures.append('the browser uploads to Amazon S3 with POST but the asset bucket '
                    'CORS rule does not allow POST -> the preflight fails and every '
                    'upload is blocked in the browser')
elif uses_presigned_post != bool(browser_posts):
    failures.append('assets.py and AssetLibrary.jsx disagree on the upload method '
                    '(presigned POST vs PUT)')

# ------------------------------------------------------------ report --
print()
if failures:
    print('FAILURES:', file=sys.stderr)
    for failure in failures:
        print(f'  FAIL {failure}', file=sys.stderr)
    sys.exit(1)
print('PASS  frontend, API Gateway and handler field contracts agree.')
