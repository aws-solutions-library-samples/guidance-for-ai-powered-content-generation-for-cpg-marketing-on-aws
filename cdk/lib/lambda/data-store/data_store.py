# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Generic CRUD store for simple CPG entities (audiences, regulatory rules).

One Amazon DynamoDB table serves multiple entity types. The partition key is the
caller's Cognito subject and the sort key is `<entity_type>#<id>`, so a single
Query returns exactly one entity type for exactly one tenant. The entity type is
derived from the API Gateway resource path, never from the request body.
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

TABLE_NAME = os.environ['DATA_TABLE']
table = boto3.resource('dynamodb').Table(TABLE_NAME)

ALLOWED_ENTITIES = ('audiences', 'regulatory-rules')
RESERVED = ('owner', 'sk', 'id', 'entity_type')


def _entity_type(event):
    """Derive the entity type from the API Gateway resource path."""
    parts = (event.get('resource') or '').strip('/').split('/')
    entity = parts[0] if parts else ''
    if entity not in ALLOWED_ENTITIES:
        raise BadRequest('Unknown entity')
    return entity


def _sk(entity, item_id):
    return f'{entity}#{item_id}'


def _public(item):
    return {k: v for k, v in item.items() if k not in ('owner', 'sk')}


@handle_errors
def handler(event, context):
    owner = caller_id(event)
    entity = _entity_type(event)
    method = event.get('httpMethod', 'GET')
    item_id = (event.get('pathParameters') or {}).get('id')
    body = json.loads(event['body']) if isinstance(event.get('body'), str) else (event.get('body') or {})

    if method == 'GET' and not item_id:
        resp = table.query(
            KeyConditionExpression=Key('owner').eq(owner) & Key('sk').begins_with(f'{entity}#'),
        )
        return response(200, {'items': [_public(i) for i in resp.get('Items', [])]})

    if method == 'GET' and item_id:
        item = table.get_item(Key={'owner': owner, 'sk': _sk(entity, item_id)}).get('Item')
        return response(200, _public(item)) if item else response(404, {'error': 'Not found'})

    if method == 'POST':
        name = (body.get('name') or '').strip()
        if not name:
            raise BadRequest('name is required')
        if len(name) > 200:
            raise BadRequest('name must be 200 characters or fewer')
        item_id = str(uuid.uuid4())
        extras = {
            k: (v[:2000] if isinstance(v, str) else v)
            for k, v in body.items() if k not in RESERVED and k != 'name'
        }
        if len(extras) > 20:
            raise BadRequest('too many fields on this item')
        item = {
            'owner': owner,
            'sk': _sk(entity, item_id),
            'id': item_id,
            'entity_type': entity,
            'name': name,
            **extras,
        }
        table.put_item(Item=item)
        return response(200, _public(item))

    if method == 'DELETE' and item_id:
        table.delete_item(Key={'owner': owner, 'sk': _sk(entity, item_id)})
        return response(200, {'status': 'deleted'})

    return response(405, {'error': 'Method not allowed'})
