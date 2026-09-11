# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Video generation using Amazon Nova Reel via Amazon Bedrock asynchronous invocation.

Security notes:
  - Output is written under `videos/<owner>/`, so each caller's media is namespaced
    by their Cognito subject.
  - The status action verifies that the invocation's output prefix belongs to the
    calling identity before returning a presigned URL, so a caller cannot poll
    another caller's job by supplying its invocation ARN.
  - The prompt is screened by the Amazon Bedrock guardrail before invocation.
"""

import json
import os

import boto3
from apphelpers import (BadRequest, caller_id, guard_text, handle_errors,
                        logger, response)

BEDROCK_REGION = os.environ.get('BEDROCK_REGION', 'us-east-1')
VIDEO_OUTPUT_BUCKET = os.environ['VIDEO_OUTPUT_BUCKET']
MODEL_ID = os.environ.get('BEDROCK_MODEL', 'amazon.nova-reel-v1:1')

MAX_PROMPT_CHARS = 2000
VIDEO_URL_TTL = 3600

bedrock = boto3.client('bedrock-runtime', region_name=BEDROCK_REGION)
s3 = boto3.client('s3')


def _owner_prefix(owner):
    return f'videos/{owner}/'


def _start(owner, body):
    prompt = (body.get('prompt') or '').strip()
    if not prompt:
        raise BadRequest('prompt is required')
    if len(prompt) > MAX_PROMPT_CHARS:
        raise BadRequest(f'prompt must be {MAX_PROMPT_CHARS} characters or fewer')
    guard_text(prompt)

    result = bedrock.start_async_invoke(
        modelId=MODEL_ID,
        modelInput={
            'taskType': 'TEXT_VIDEO',
            'textToVideoParams': {'text': prompt},
            'videoGenerationConfig': {
                'durationSeconds': 6,
                'fps': 24,
                'dimension': '1280x720',
            },
        },
        outputDataConfig={
            's3OutputDataConfig': {
                's3Uri': f's3://{VIDEO_OUTPUT_BUCKET}/{_owner_prefix(owner)}'
            }
        },
    )
    return response(200, {
        'invocation_arn': result['invocationArn'],
        'status': 'InProgress',
        'estimated_seconds': 90,
    })


def _status(owner, body):
    arn = (body.get('invocation_arn') or '').strip()
    if not arn:
        raise BadRequest('invocation_arn is required')

    invocation = bedrock.get_async_invoke(invocationArn=arn)
    output_uri = (invocation.get('outputDataConfig', {})
                  .get('s3OutputDataConfig', {})
                  .get('s3Uri', ''))

    # Ownership check. The output prefix was fixed when this caller started the
    # job, so a prefix belonging to a different subject means the ARN is not theirs.
    expected = f's3://{VIDEO_OUTPUT_BUCKET}/{_owner_prefix(owner)}'
    if not output_uri.startswith(expected):
        logger.warning('rejected cross-tenant video status request')
        raise PermissionError('invocation does not belong to the calling identity')

    status = invocation.get('status', 'Unknown')
    result = {'invocation_arn': arn, 'status': status}

    if status == 'Completed':
        key = output_uri.replace(f's3://{VIDEO_OUTPUT_BUCKET}/', '') + '/output.mp4'
        result['presigned_url'] = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': VIDEO_OUTPUT_BUCKET, 'Key': key},
            ExpiresIn=VIDEO_URL_TTL,
        )
    elif status == 'Failed':
        # The service failure message can name internal resources, so it is logged
        # rather than returned.
        logger.error('video invocation failed: %s', invocation.get('failureMessage'))
        result['failure_message'] = 'Video generation failed. Please try again.'

    return response(200, result)


@handle_errors
def handler(event, context):
    owner = caller_id(event)
    body = json.loads(event['body']) if isinstance(event.get('body'), str) else (event.get('body') or {})
    action = (body.get('action') or 'generate').strip()

    if action == 'generate':
        return _start(owner, body)
    if action == 'status':
        return _status(owner, body)
    raise BadRequest("action must be 'generate' or 'status'")
