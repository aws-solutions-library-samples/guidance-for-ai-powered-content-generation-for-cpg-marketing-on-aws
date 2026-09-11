# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Image generation using Amazon Bedrock (Stability AI Stable Image style guide model).

The request path mints a server-side job identifier and self-invokes
asynchronously; the worker path does the generation and writes the result.

Security notes:
  - The job identifier is always generated here. A request arriving through Amazon
    API Gateway can never reach the worker branch, so no caller can influence an
    S3 object key or drive the long-running path synchronously.
  - Object keys are namespaced by the caller's Cognito subject, so one caller
    cannot read or overwrite another caller's output.
  - The prompt is screened by the Amazon Bedrock guardrail before invocation.
"""

import base64
import json
import os
import struct
import uuid
import zlib
from datetime import datetime, timezone

import boto3
from apphelpers import (BadRequest, caller_id, guard_text, handle_errors,
                        is_api_request, logger, response)

BEDROCK_REGION = os.environ.get('BEDROCK_REGION', 'us-east-1')
IMAGE_OUTPUT_BUCKET = os.environ['IMAGE_OUTPUT_BUCKET']
MODEL_ID = 'us.stability.stable-image-style-guide-v1:0'
FUNCTION_NAME = os.environ.get('AWS_LAMBDA_FUNCTION_NAME', '')

MAX_PROMPT_CHARS = 4000
MAX_IMAGES = 2
RESULT_URL_TTL = 900
IMAGE_URL_TTL = 3600

bedrock = boto3.client('bedrock-runtime', region_name=BEDROCK_REGION)
s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')


def _blank_png_b64():
    """Minimal 64x64 white PNG, required as the style guide model's image input."""
    w, h = 64, 64

    def chunk(tag, data):
        body = tag + data
        return (struct.pack('>I', len(data)) + body
                + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF))

    raw = b''.join(b'\x00' + b'\xff\xff\xff' * w for _ in range(h))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw))
           + chunk(b'IEND', b''))
    return base64.b64encode(png).decode()


def _result_key(owner, job_id):
    return f'images/jobs/{owner}/{job_id}/result.json'


def _put_result(owner, job_id, payload):
    s3.put_object(
        Bucket=IMAGE_OUTPUT_BUCKET,
        Key=_result_key(owner, job_id),
        Body=json.dumps(payload),
        ContentType='application/json',
    )


def _generate(owner, job_id, prompt, count, seed):
    """Worker path: generate images, store them, and publish the result document."""
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    blank = _blank_png_b64()
    urls = []

    try:
        for i in range(count):
            resp = bedrock.invoke_model(
                modelId=MODEL_ID,
                body=json.dumps({
                    'prompt': prompt,
                    'image': blank,
                    'fidelity': 0.1,
                    'seed': seed + i,
                    'output_format': 'png',
                }),
                contentType='application/json',
                accept='application/json',
            )
            data = json.loads(resp['body'].read())
            if data.get('images'):
                key = f'images/{owner}/{timestamp}/{job_id}/{i}.png'
                s3.put_object(
                    Bucket=IMAGE_OUTPUT_BUCKET,
                    Key=key,
                    Body=base64.b64decode(data['images'][0]),
                    ContentType='image/png',
                )
                urls.append({
                    'url': s3.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': IMAGE_OUTPUT_BUCKET, 'Key': key},
                        ExpiresIn=IMAGE_URL_TTL,
                    ),
                    'seed': seed + i,
                })
        _put_result(owner, job_id, {'status': 'complete', 'presigned_urls': urls})
    except Exception as exc:  # noqa: BLE001
        # Publish a terminal error document so the browser stops polling instead of
        # waiting forever on an object that would never appear.
        logger.error('image job %s failed: %s: %s', job_id, type(exc).__name__, exc)
        _put_result(owner, job_id, {
            'status': 'error',
            'error': 'Image generation failed. Please try again.',
        })
        raise


@handle_errors
def handler(event, context):
    # Worker invocation. Only reachable from this function's own async self-invoke:
    # API Gateway always populates requestContext, so an external caller cannot
    # take this branch even by sending the same fields.
    worker = event.get('_worker')
    if worker and not is_api_request(event):
        _generate(worker['owner'], worker['job_id'], worker['prompt'],
                  worker['count'], worker['seed'])
        return {'statusCode': 200, 'body': '{}'}

    owner = caller_id(event)
    body = json.loads(event['body']) if isinstance(event.get('body'), str) else (event.get('body') or {})

    prompt = (body.get('prompt') or '').strip()
    if not prompt:
        raise BadRequest('prompt is required')
    if len(prompt) > MAX_PROMPT_CHARS:
        raise BadRequest(f'prompt must be {MAX_PROMPT_CHARS} characters or fewer')
    guard_text(prompt)

    try:
        count = min(max(int(body.get('count', MAX_IMAGES)), 1), MAX_IMAGES)
    except (TypeError, ValueError):
        raise BadRequest('count must be an integer')

    seed = int.from_bytes(os.urandom(4), 'big') % 2147483647

    job_id = str(uuid.uuid4())
    status_url = s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': IMAGE_OUTPUT_BUCKET, 'Key': _result_key(owner, job_id)},
        ExpiresIn=RESULT_URL_TTL,
    )

    lambda_client.invoke(
        FunctionName=FUNCTION_NAME,
        InvocationType='Event',
        Payload=json.dumps({'_worker': {
            'owner': owner,
            'job_id': job_id,
            'prompt': prompt,
            'count': count,
            'seed': seed,
        }}),
    )

    return response(200, {
        'job_id': job_id,
        'status': 'processing',
        'status_url': status_url,
    })
