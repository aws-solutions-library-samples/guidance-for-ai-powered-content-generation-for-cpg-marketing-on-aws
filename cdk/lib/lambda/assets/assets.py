# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Digital Asset Management (DAM-lite) Lambda.

POST   /assets       issues a presigned POST policy for direct S3 upload and records metadata
GET    /assets       lists the caller's assets with presigned download URLs
DELETE /assets/{id}  removes one of the caller's assets and its S3 object

Security notes:
  - Metadata is partitioned by the caller's Cognito subject, and listing uses a
    Query on that partition rather than a full table Scan.
  - Object keys are built as `assets/<owner>/<uuid>/<validated name>`, so no caller
    can write outside their own prefix or overwrite another tenant's object.
  - Uploads are limited to an allowlisted content type and a maximum size that the
    presigned URL itself enforces.
"""

import json
import os
import uuid

import boto3
# Imported explicitly. `import boto3` alone does not bind boto3.dynamodb, so
# referencing boto3.dynamodb.conditions.Key would only work as a side effect of
# having constructed a dynamodb resource first.
from boto3.dynamodb.conditions import Key
from apphelpers import BadRequest, caller_id, handle_errors, response, safe_name

ASSET_BUCKET = os.environ['ASSET_BUCKET']
ASSET_TABLE = os.environ['ASSET_TABLE']

s3 = boto3.client('s3')
table = boto3.resource('dynamodb').Table(ASSET_TABLE)

UPLOAD_URL_TTL = 600      # 10 minutes to start the upload
DOWNLOAD_URL_TTL = 3600   # 1 hour to fetch an object
MAX_UPLOAD_BYTES = 100 * 1024 * 1024

ALLOWED_CONTENT_TYPES = {
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf', 'text/plain',
}


def _public(item):
    return {k: v for k, v in item.items() if k != 'owner'}


@handle_errors
def handler(event, context):
    owner = caller_id(event)
    method = event.get('httpMethod', 'GET')
    asset_id = (event.get('pathParameters') or {}).get('id')
    body = json.loads(event['body']) if isinstance(event.get('body'), str) else (event.get('body') or {})

    if method == 'POST':
        # `name` becomes part of an S3 key, so it is validated rather than trusted.
        name = safe_name(body.get('name'), 'name')
        content_type = (body.get('content_type') or 'application/octet-stream').strip()
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise BadRequest(
                'content_type must be one of: ' + ', '.join(sorted(ALLOWED_CONTENT_TYPES))
            )

        tags = body.get('tags') or []
        if not isinstance(tags, list) or len(tags) > 20:
            raise BadRequest('tags must be a list of at most 20 values')
        tags = [safe_name(t, 'tag') for t in tags]

        asset_id = str(uuid.uuid4())
        key = f'assets/{owner}/{asset_id}/{name}'

        # ContentLengthRange is signed into the URL, so S3 rejects an oversized
        # upload even though the bytes never pass through this function.
        presigned = s3.generate_presigned_post(
            Bucket=ASSET_BUCKET,
            Key=key,
            Fields={'Content-Type': content_type},
            Conditions=[
                {'Content-Type': content_type},
                ['content-length-range', 1, MAX_UPLOAD_BYTES],
            ],
            ExpiresIn=UPLOAD_URL_TTL,
        )

        item = {
            'owner': owner,
            'id': asset_id,
            'name': name,
            'key': key,
            'content_type': content_type,
            'tags': tags,
            'description': str(body.get('description', ''))[:1000],
        }
        table.put_item(Item=item)
        return response(200, {
            **_public(item),
            'upload': {'url': presigned['url'], 'fields': presigned['fields']},
            'max_bytes': MAX_UPLOAD_BYTES,
        })

    if method == 'GET':
        resp = table.query(KeyConditionExpression=Key('owner').eq(owner))
        items = []
        for item in resp.get('Items', []):
            public = _public(item)
            public['url'] = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': ASSET_BUCKET, 'Key': item['key']},
                ExpiresIn=DOWNLOAD_URL_TTL,
            )
            items.append(public)
        return response(200, {'assets': items})

    if method == 'DELETE' and asset_id:
        item = table.get_item(Key={'owner': owner, 'id': asset_id}).get('Item')
        if item:
            try:
                s3.delete_object(Bucket=ASSET_BUCKET, Key=item['key'])
            except Exception as exc:  # noqa: BLE001 - metadata delete still proceeds
                # Logged with no caller-facing detail; the object is lifecycle-managed.
                print(f'S3 delete failed for asset {asset_id}: {type(exc).__name__}')
            table.delete_item(Key={'owner': owner, 'id': asset_id})
        return response(200, {'status': 'deleted'})

    return response(405, {'error': 'Method not allowed'})
