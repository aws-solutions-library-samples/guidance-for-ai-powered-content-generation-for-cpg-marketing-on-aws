# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Brand profile management: store and retrieve brand guidelines.

Each caller has their own profile at `brand-profiles/<owner>.txt`, keyed by the
Cognito subject claim. Previously a single shared object meant any user could
rewrite the guidelines that were injected into every other user's prompts, which
was a stored indirect prompt-injection path.
"""

import json
import os

import boto3
from apphelpers import BadRequest, caller_id, handle_errors, response

BRAND_BUCKET = os.environ['BRAND_BUCKET']
MAX_PROFILE_CHARS = 20000

s3 = boto3.client('s3')


def _key(owner):
    return f'brand-profiles/{owner}.txt'


@handle_errors
def handler(event, context):
    owner = caller_id(event)
    method = event.get('httpMethod', 'GET')

    if method == 'GET':
        try:
            obj = s3.get_object(Bucket=BRAND_BUCKET, Key=_key(owner))
            return response(200, {'content': obj['Body'].read().decode('utf-8')})
        except s3.exceptions.NoSuchKey:
            return response(200, {'content': ''})

    if method == 'POST':
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else (event.get('body') or {})
        content = body.get('content', '')
        if not isinstance(content, str):
            raise BadRequest('content must be a string')
        if len(content) > MAX_PROFILE_CHARS:
            raise BadRequest(f'content must be {MAX_PROFILE_CHARS} characters or fewer')
        s3.put_object(
            Bucket=BRAND_BUCKET,
            Key=_key(owner),
            Body=content.encode('utf-8'),
            ContentType='text/plain',
        )
        return response(200, {'status': 'saved'})

    return response(405, {'error': 'Method not allowed'})
