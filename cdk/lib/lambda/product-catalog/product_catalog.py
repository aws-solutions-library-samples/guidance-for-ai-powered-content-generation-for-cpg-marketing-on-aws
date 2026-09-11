# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Product catalog CRUD (PIM-lite) backed by Amazon DynamoDB.

Every item is stored under the caller's Cognito subject as the partition key, so
a caller can only ever read, write, or delete their own records. Listing uses a
Query bounded to that partition rather than a full table Scan.
"""

import json
import os
import uuid

import boto3
# Imported explicitly. `import boto3` alone does not bind boto3.dynamodb, so
# referencing boto3.dynamodb.conditions.Key would only work as a side effect of
# having constructed a dynamodb resource first.
from boto3.dynamodb.conditions import Key
from apphelpers import BadRequest, caller_id, handle_errors, response

TABLE_NAME = os.environ['PRODUCT_TABLE']
table = boto3.resource('dynamodb').Table(TABLE_NAME)

FIELDS = ('name', 'category', 'sku', 'description', 'attributes')


def _public(item):
    """Strip the tenant key before returning an item to the caller."""
    return {k: v for k, v in item.items() if k != 'owner'}


@handle_errors
def handler(event, context):
    owner = caller_id(event)
    method = event.get('httpMethod', 'GET')
    product_id = (event.get('pathParameters') or {}).get('id')
    body = json.loads(event['body']) if isinstance(event.get('body'), str) else (event.get('body') or {})

    if method == 'GET' and not product_id:
        resp = table.query(KeyConditionExpression=Key('owner').eq(owner))
        return response(200, {'products': [_public(i) for i in resp.get('Items', [])]})

    if method == 'GET' and product_id:
        item = table.get_item(Key={'owner': owner, 'id': product_id}).get('Item')
        return response(200, _public(item)) if item else response(404, {'error': 'Not found'})

    if method == 'POST':
        name = (body.get('name') or '').strip()
        if not name:
            raise BadRequest('name is required')
        if len(name) > 200:
            raise BadRequest('name must be 200 characters or fewer')
        item = {
            'owner': owner,
            # The identifier is always generated server-side. A caller-supplied id
            # could only ever land in their own partition, but generating it here
            # keeps identifiers opaque and non-guessable.
            'id': str(uuid.uuid4()),
            'name': name,
            'category': str(body.get('category', ''))[:120],
            'sku': str(body.get('sku', ''))[:80],
            'description': str(body.get('description', ''))[:2000],
            'attributes': body.get('attributes', {}),
        }
        table.put_item(Item=item)
        return response(200, _public(item))

    if method == 'DELETE' and product_id:
        # The owner is part of the key, so a caller cannot delete another
        # tenant's product even by guessing its identifier.
        table.delete_item(Key={'owner': owner, 'id': product_id})
        return response(200, {'status': 'deleted'})

    return response(405, {'error': 'Method not allowed'})
