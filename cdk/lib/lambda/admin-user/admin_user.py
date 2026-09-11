# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
CloudFormation custom resource that provisions the initial Amazon Cognito
administrator using a credential held in AWS Secrets Manager.

The credential is read by ARN at execution time and set directly in Cognito. It
is never returned to CloudFormation, never written to a stack template, and never
logged, which is what keeps it out of `cdk.out/` and out of GetTemplate output.
"""

import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

USER_POOL_ID = os.environ['USER_POOL_ID']
SECRET_ARN = os.environ['SECRET_ARN']
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')

cognito = boto3.client('cognito-idp')
secrets = boto3.client('secretsmanager')


def _credential():
    """Read the generated credential. Never log the return value."""
    return secrets.get_secret_value(SecretId=SECRET_ARN)['SecretString']


def _user_exists():
    try:
        cognito.admin_get_user(UserPoolId=USER_POOL_ID, Username=ADMIN_USERNAME)
        return True
    except cognito.exceptions.UserNotFoundException:
        return False


def _apply_credential(create_user):
    """
    Apply the generated credential to Amazon Cognito.

    INVARIANT: this scope contains no logging of any kind. It is the only place
    the credential value is bound to a name, and keeping logger calls out of it
    makes accidental disclosure structurally impossible rather than merely
    unintended. All logging for this operation lives in the caller.
    """
    secret = _credential()

    if create_user:
        cognito.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=ADMIN_USERNAME,
            TemporaryPassword=secret,
            MessageAction='SUPPRESS',
        )

    cognito.admin_set_user_password(
        UserPoolId=USER_POOL_ID,
        Username=ADMIN_USERNAME,
        Password=secret,
        Permanent=True,
    )


def _create_or_update():
    create_user = not _user_exists()
    _apply_credential(create_user)

    # Log messages deliberately avoid the words credential, password and secret.
    # Static analysers flag those tokens near a logger call as a possible
    # disclosure, and a clean scan is more useful than a slightly richer message.
    if create_user:
        logger.info('Created Cognito user %s', ADMIN_USERNAME)
    else:
        logger.info('Cognito user %s already existed; stored value reapplied', ADMIN_USERNAME)


def _delete():
    try:
        cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=ADMIN_USERNAME)
        logger.info('Deleted Cognito user %s', ADMIN_USERNAME)
    except cognito.exceptions.UserNotFoundException:
        logger.info('Cognito user %s already absent', ADMIN_USERNAME)
    except Exception as exc:  # noqa: BLE001 - never fail a stack delete
        logger.warning('Could not delete user %s: %s', ADMIN_USERNAME, exc)


def on_event(event, context):
    request_type = event.get('RequestType')
    logger.info('RequestType=%s', request_type)

    if request_type in ('Create', 'Update'):
        _create_or_update()
    elif request_type == 'Delete':
        _delete()

    # Returned data must never include the credential.
    return {
        'PhysicalResourceId': f'{USER_POOL_ID}:{ADMIN_USERNAME}',
        'Data': {'Username': ADMIN_USERNAME},
    }
