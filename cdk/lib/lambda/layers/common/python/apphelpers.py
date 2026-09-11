# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Shared helpers for every API handler in this Guidance.

Deployed as a Lambda layer so there is one source of truth for caller identity,
tenant scoping, CORS, and error shaping. Three behaviours matter for security:

1. `caller_id` derives the tenant from the Amazon Cognito subject claim that the
   API Gateway authorizer already validated. It is never taken from the request
   body, so a caller cannot select another tenant's partition.
2. `error_response` returns a generic message plus a correlation identifier. The
   underlying exception is logged server-side only, so bucket names, table names,
   and account identifiers are not disclosed to callers.
3. `guard_text` runs a prompt through the Amazon Bedrock guardrail before any
   model invocation, covering the image and video paths where the guardrail
   cannot be passed inline to the model.
"""

import json
import logging
import os
import re
import uuid

import boto3

logger = logging.getLogger()
logger.setLevel(os.environ.get('LOG_LEVEL', 'INFO'))

WEB_ORIGIN = os.environ.get('WEB_ORIGIN', '')
GUARDRAIL_ID = os.environ.get('GUARDRAIL_ID', '')
GUARDRAIL_VERSION = os.environ.get('GUARDRAIL_VERSION', '')
BEDROCK_REGION = os.environ.get('BEDROCK_REGION', 'us-east-1')

CORS_HEADERS = {
    'Access-Control-Allow-Origin': WEB_ORIGIN or 'null',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Content-Type': 'application/json',
}

# S3 keys and DynamoDB sort keys are built from caller input in a few places.
# Anything outside this set is rejected rather than sanitized silently.
_SAFE_NAME = re.compile(r'^[A-Za-z0-9._-]{1,120}$')


class Unauthorized(Exception):
    """Raised when the request carries no usable Cognito identity."""


class BadRequest(Exception):
    """Raised when caller input fails validation."""


def caller_id(event):
    """
    Return the Cognito subject claim for the authenticated caller.

    The value comes from the API Gateway authorizer context, which means it was
    cryptographically verified against the Cognito JWKS before this function ran.
    """
    claims = ((event.get('requestContext') or {}).get('authorizer') or {}).get('claims') or {}
    sub = claims.get('sub')
    if not sub:
        raise Unauthorized('request is missing a verified Cognito identity')
    return sub


def is_api_request(event):
    """True when the event arrived through Amazon API Gateway."""
    return bool(event.get('requestContext'))


def safe_name(value, field='name'):
    """Validate a caller-supplied string that will become part of a storage key."""
    value = (value or '').strip()
    if not _SAFE_NAME.match(value):
        raise BadRequest(
            f'{field} must be 1-120 characters using letters, digits, dot, underscore or hyphen'
        )
    return value


def response(status, body):
    return {
        'statusCode': status,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, default=str),
    }


def error_response(status, message, exc=None):
    """
    Return a generic error with a correlation identifier.

    The exception detail is logged, never returned, so internal resource names
    stay server-side.
    """
    correlation_id = str(uuid.uuid4())
    if exc is not None:
        logger.error('correlation_id=%s %s: %s', correlation_id, type(exc).__name__, exc)
    else:
        logger.error('correlation_id=%s %s', correlation_id, message)
    return response(status, {'error': message, 'correlation_id': correlation_id})


def handle_errors(func):
    """Wrap a handler so no raw exception text ever reaches the caller."""
    def wrapper(event, context):
        try:
            return func(event, context)
        except Unauthorized as exc:
            return error_response(401, 'Unauthorized.', exc)
        except BadRequest as exc:
            # BadRequest messages are authored here, so they are safe to return.
            return error_response(400, str(exc), exc)
        except PermissionError as exc:
            return error_response(403, 'Forbidden.', exc)
        except Exception as exc:  # noqa: BLE001
            return error_response(
                500,
                'The request could not be completed. Quote the correlation identifier '
                'when reporting this problem.',
                exc,
            )
    wrapper.__name__ = getattr(func, '__name__', 'wrapper')
    return wrapper


_bedrock = None


def _bedrock_client():
    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client('bedrock-runtime', region_name=BEDROCK_REGION)
    return _bedrock


def guardrail_kwargs():
    """Inline guardrail arguments for invoke_model, empty if no guardrail is set."""
    if GUARDRAIL_ID and GUARDRAIL_VERSION:
        return {
            'guardrailIdentifier': GUARDRAIL_ID,
            'guardrailVersion': GUARDRAIL_VERSION,
        }
    return {}


def guard_text(text, source='INPUT'):
    """
    Screen text against the Amazon Bedrock guardrail.

    Used on the image and video paths, where the guardrail cannot be attached to
    the model invocation itself. Raises BadRequest when the guardrail intervenes.
    """
    if not (GUARDRAIL_ID and GUARDRAIL_VERSION):
        return text
    result = _bedrock_client().apply_guardrail(
        guardrailIdentifier=GUARDRAIL_ID,
        guardrailVersion=GUARDRAIL_VERSION,
        source=source,
        content=[{'text': {'text': text}}],
    )
    if result.get('action') == 'GUARDRAIL_INTERVENED':
        logger.info('guardrail intervened on %s', source.lower())
        raise BadRequest(
            'This prompt was blocked because it does not meet content policy requirements.'
        )
    return text
