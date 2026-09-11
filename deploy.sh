#!/bin/bash
# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# Compatibility shim. The maintained deployment script now lives at
# scripts/deploy.sh, which adds platform detection, prerequisite checks,
# CDK bootstrap handling, post-deploy validation, and a --destroy path.
#
# Usage:
#   ./deploy.sh              (prompts for the initial admin credential)
#   ./deploy.sh --destroy    (tears the stack down)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/scripts/deploy.sh" "$@"
