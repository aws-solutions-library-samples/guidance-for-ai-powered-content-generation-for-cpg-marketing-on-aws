// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Amazon Bedrock models this Guidance invokes. Used to build least-privilege
 * resource ARNs instead of granting bedrock actions on '*'.
 */
const FOUNDATION_MODELS = [
  'stability.stable-image-style-guide-v1:0',
  'amazon.nova-pro-v1:0',
  'amazon.nova-reel-v1:1',
];
const INFERENCE_PROFILES = [
  'us.stability.stable-image-style-guide-v1:0',
  'us.amazon.nova-pro-v1:0',
];

const LOG_RETENTION = logs.RetentionDays.THREE_MONTHS;

export class ContentGenStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------- logging --
    // Central destination for Amazon S3 server access logs and Amazon CloudFront
    // standard logs. BUCKET_OWNER_PREFERRED is required for CloudFront log delivery.
    const logBucket = new s3.Bucket(this, 'AccessLogs', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ------------------------------------------------------------ S3 buckets --
    const imageOutputBucket = new s3.Bucket(this, 'ImageOutput', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 's3/image-output/',
      lifecycleRules: [
        { expiration: cdk.Duration.days(30) },
        { abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) },
        { noncurrentVersionExpiration: cdk.Duration.days(7) },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const videoOutputBucket = new s3.Bucket(this, 'VideoOutput', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 's3/video-output/',
      lifecycleRules: [
        { expiration: cdk.Duration.days(7) },
        { abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) },
        { noncurrentVersionExpiration: cdk.Duration.days(3) },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const brandBucket = new s3.Bucket(this, 'BrandAssets', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 's3/brand-assets/',
      lifecycleRules: [{ noncurrentVersionExpiration: cdk.Duration.days(30) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const assetBucket = new s3.Bucket(this, 'AssetLibrary', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 's3/asset-library/',
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) },
        { noncurrentVersionExpiration: cdk.Duration.days(30) },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 's3/website/',
      lifecycleRules: [{ noncurrentVersionExpiration: cdk.Duration.days(7) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --------------------------------------------------------- CloudFront CDN --
    // Created before the REST API so the API can restrict CORS to this origin.
    const distribution = new cloudfront.Distribution(this, 'CDN', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
          securityHeadersBehavior: {
            strictTransportSecurity: {
              accessControlMaxAge: cdk.Duration.days(365),
              includeSubdomains: true,
              override: true,
            },
            contentTypeOptions: { override: true },
            frameOptions: {
              frameOption: cloudfront.HeadersFrameOption.DENY,
              override: true,
            },
            referrerPolicy: {
              referrerPolicy: cloudfront.HeadersReferrerPolicy.SAME_ORIGIN,
              override: true,
            },
            xssProtection: { protection: true, modeBlock: true, override: true },
          },
        }),
      },
      defaultRootObject: 'index.html',
      enableLogging: true,
      logBucket,
      logFilePrefix: 'cloudfront/',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });
    const webOrigin = `https://${distribution.distributionDomainName}`;

    // ---------------------------------------------------------------- DynamoDB --
    // Every table is partitioned by `owner` (the Amazon Cognito subject claim) so a
    // caller can only ever Query their own partition. Point-in-time recovery is on.
    const tableDefaults = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    };

    const conversationTable = new dynamodb.Table(this, 'Conversations', {
      partitionKey: { name: 'owner', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    const productTable = new dynamodb.Table(this, 'Products', {
      partitionKey: { name: 'owner', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    // Audiences and regulatory rules share this table; the sort key is
    // `<entity_type>#<id>` so one Query returns a single entity type per caller.
    const dataTable = new dynamodb.Table(this, 'DataStore', {
      partitionKey: { name: 'owner', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    const assetTable = new dynamodb.Table(this, 'Assets', {
      partitionKey: { name: 'owner', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    // ----------------------------------------------------------------- Cognito --
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: { userPassword: true },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(1),
    });

    // ----------------------------------------------- initial admin credential --
    // The credential is generated by AWS Secrets Manager and never appears in the
    // CloudFormation template, in cdk.out/, or in any log. A provisioner function
    // reads it by ARN at deploy time and sets it directly in Amazon Cognito.
    const adminSecret = new secretsmanager.Secret(this, 'AdminCredential', {
      description: 'Initial admin credential for the content generation web application',
      generateSecretString: {
        passwordLength: 24,
        requireEachIncludedType: true,
        // Excluded characters would break shell copy/paste or JSON transport.
        excludeCharacters: '"\'`\\/@ $&|;<>()',
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const lambdaDir = path.join(__dirname, 'lambda');

    const makeLogGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        retention: LOG_RETENTION,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

    // Single source of truth for caller identity, tenant scoping, CORS and error
    // shaping across all API handlers.
    const commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'layers', 'common')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      description: 'Shared identity, CORS, guardrail and error helpers',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const adminProvisionerFn = new lambda.Function(this, 'AdminProvisioner', {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'admin_user.on_event',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'admin-user')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 128,
      logGroup: makeLogGroup('AdminProvisioner'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        SECRET_ARN: adminSecret.secretArn,
        ADMIN_USERNAME: 'admin',
      },
    });
    adminSecret.grantRead(adminProvisionerFn);
    adminProvisionerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminDeleteUser',
      ],
      resources: [userPool.userPoolArn],
    }));

    const adminProvider = new cr.Provider(this, 'AdminProvider', {
      onEventHandler: adminProvisionerFn,
      logGroup: makeLogGroup('AdminProvider'),
    });

    new cdk.CustomResource(this, 'AdminUser', {
      serviceToken: adminProvider.serviceToken,
      properties: {
        // Forces the credential to be re-applied if the secret is rotated.
        SecretVersion: adminSecret.secretArn,
      },
    });

    // -------------------------------------------------------- Bedrock guardrail --
    // Filters prompts and completions for harmful content, prompt attacks,
    // profanity, and personally identifiable information.
    const guardrail = new bedrock.CfnGuardrail(this, 'ContentGuardrail', {
      name: `${cdk.Stack.of(this).stackName}-content-guardrail`.toLowerCase(),
      description: 'Filters marketing content generation prompts and completions',
      blockedInputMessaging:
        'This request was blocked because it does not meet content policy requirements.',
      blockedOutputsMessaging:
        'The generated content was blocked because it does not meet content policy requirements.',
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
      wordPolicyConfig: {
        managedWordListsConfig: [{ type: 'PROFANITY' }],
      },
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'MedicalAndHealthClaims',
            type: 'DENY',
            definition:
              'Claims that a consumer product diagnoses, treats, cures, mitigates or '
              + 'prevents any disease or medical condition, or any statement implying a '
              + 'therapeutic or clinical health outcome.',
            examples: [
              'This supplement cures diabetes.',
              'Clinically proven to reverse heart disease.',
            ],
          },
          {
            name: 'CompetitorDisparagement',
            type: 'DENY',
            definition:
              'Statements that name a competing brand or product in order to criticise, '
              + 'demean or make unfavourable comparative claims about it.',
            examples: ['Brand X is garbage compared to ours.'],
          },
        ],
      },
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'ANONYMIZE' },
          { type: 'PHONE', action: 'ANONYMIZE' },
          { type: 'NAME', action: 'ANONYMIZE' },
          { type: 'ADDRESS', action: 'ANONYMIZE' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
          { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
        ],
      },
    });

    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'ContentGuardrailVersion', {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: 'Deployed version',
    });

    // ------------------------------------------------- Bedrock resource ARNs ----
    const foundationModelArns = FOUNDATION_MODELS.map(
      (m) => `arn:${this.partition}:bedrock:*::foundation-model/${m}`,
    );
    const inferenceProfileArns = INFERENCE_PROFILES.map(
      (p) => `arn:${this.partition}:bedrock:${this.region}:${this.account}:inference-profile/${p}`,
    );
    const guardrailArn = `arn:${this.partition}:bedrock:${this.region}:${this.account}:guardrail/${guardrail.attrGuardrailId}`;

    /** Grants only the Bedrock actions a given function actually performs. */
    const grantBedrock = (fn: lambda.Function, opts: { async?: boolean } = {}) => {
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [...foundationModelArns, ...inferenceProfileArns],
      }));
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['bedrock:ApplyGuardrail'],
        resources: [guardrailArn],
      }));
      if (opts.async) {
        fn.addToRolePolicy(new iam.PolicyStatement({
          actions: ['bedrock:StartAsyncInvoke'],
          resources: [...foundationModelArns, ...inferenceProfileArns],
        }));
        fn.addToRolePolicy(new iam.PolicyStatement({
          // StartAsyncInvoke authorizes against TWO resources: the model (above)
          // and the server-generated async-invoke resource. It checks
          // bedrock:InvokeModel on the latter, so omitting it here fails with
          // "not authorized to perform: bedrock:InvokeModel on resource:
          // ...:async-invoke/*" even though the model grant is present.
          // GetAsyncInvoke and ListAsyncInvokes cover the status polling path.
          actions: [
            'bedrock:InvokeModel',
            'bedrock:StartAsyncInvoke',
            'bedrock:GetAsyncInvoke',
            'bedrock:ListAsyncInvokes',
          ],
          // Async invocation ARNs are server-generated; scope to this account/Region.
          resources: [`arn:${this.partition}:bedrock:${this.region}:${this.account}:async-invoke/*`],
        }));
      }
    };

    const guardrailEnv = {
      GUARDRAIL_ID: guardrail.attrGuardrailId,
      GUARDRAIL_VERSION: guardrailVersion.attrVersion,
    };

    // Handlers echo this exact origin in Access-Control-Allow-Origin rather than '*'.
    const commonEnv = { WEB_ORIGIN: webOrigin };
    // Every API handler gets a concurrency ceiling so no single route can consume
    // the account pool. Totals to 60 reserved, well inside the default 1,000.
    const apiHandlerDefaults = {
      runtime: lambda.Runtime.PYTHON_3_13,
      layers: [commonLayer],
      reservedConcurrentExecutions: 5,
    };

    // ------------------------------------------------------------------ Lambdas --
    // Each function gets its own execution role (CDK default) and only the grants
    // it needs. There is no shared role and no wildcard resource.
    const imageGenFn = new lambda.Function(this, 'ImageGen', {
      ...apiHandlerDefaults,
      handler: 'image_gen.handler',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'image-gen')),
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      reservedConcurrentExecutions: 10,
      logGroup: makeLogGroup('ImageGen'),
      environment: {
        IMAGE_OUTPUT_BUCKET: imageOutputBucket.bucketName,
        BEDROCK_REGION: this.region,
        ...guardrailEnv,
        ...commonEnv,
      },
    });
    imageOutputBucket.grantReadWrite(imageGenFn);
    grantBedrock(imageGenFn);
    // Self-invoke only. Scoped to this one function, not the whole account.
    //
    // This lives in its own iam.Policy rather than in the role's default policy
    // on purpose. The statement has to name the function ARN, which is a
    // GetAtt on the function itself, and CDK makes every Function DependsOn its
    // role's *default* policy. Putting this statement there would therefore
    // create a genuine CloudFormation circular dependency
    // (ImageGen -> ImageGenServiceRoleDefaultPolicy -> ImageGen). A standalone
    // policy is not in that DependsOn edge, so the cycle disappears while the
    // permission stays scoped to this one function ARN.
    new iam.Policy(this, 'ImageGenSelfInvoke', {
      roles: [imageGenFn.role!],
      statements: [new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [imageGenFn.functionArn],
      })],
    });

    const campaignGenFn = new lambda.Function(this, 'CampaignGen', {
      ...apiHandlerDefaults,
      handler: 'campaign_gen.handler',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'campaign-gen')),
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      reservedConcurrentExecutions: 10,
      logGroup: makeLogGroup('CampaignGen'),
      environment: {
        DYNAMODB_TABLE: conversationTable.tableName,
        BEDROCK_REGION: this.region,
        ...guardrailEnv,
        ...commonEnv,
      },
    });
    conversationTable.grantReadWriteData(campaignGenFn);
    grantBedrock(campaignGenFn);

    const videoGenFn = new lambda.Function(this, 'VideoGen', {
      ...apiHandlerDefaults,
      handler: 'video_gen.handler',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'video-gen')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      logGroup: makeLogGroup('VideoGen'),
      environment: {
        VIDEO_OUTPUT_BUCKET: videoOutputBucket.bucketName,
        BEDROCK_REGION: this.region,
        BEDROCK_MODEL: 'amazon.nova-reel-v1:1',
        ...guardrailEnv,
        ...commonEnv,
      },
    });
    videoOutputBucket.grantReadWrite(videoGenFn);
    grantBedrock(videoGenFn, { async: true });

    const textGenFn = new lambda.Function(this, 'TextGen', {
      ...apiHandlerDefaults,
      handler: 'text_gen.handler',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'text-gen')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      logGroup: makeLogGroup('TextGen'),
      environment: {
        BRAND_BUCKET: brandBucket.bucketName,
        BEDROCK_REGION: this.region,
        ...guardrailEnv,
        ...commonEnv,
      },
    });
    brandBucket.grantRead(textGenFn);
    grantBedrock(textGenFn);

    const brandProfileFn = new lambda.Function(this, 'BrandProfile', {
      ...apiHandlerDefaults,
      handler: 'brand_profile.handler',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'brand-profile')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      logGroup: makeLogGroup('BrandProfile'),
      environment: { BRAND_BUCKET: brandBucket.bucketName, ...commonEnv },
    });
    brandBucket.grantReadWrite(brandProfileFn);

    const productCatalogFn = new lambda.Function(this, 'ProductCatalog', {
      ...apiHandlerDefaults,
      handler: 'product_catalog.handler',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'product-catalog')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      logGroup: makeLogGroup('ProductCatalog'),
      environment: { PRODUCT_TABLE: productTable.tableName, ...commonEnv },
    });
    productTable.grantReadWriteData(productCatalogFn);

    const dataStoreFn = new lambda.Function(this, 'DataStoreFn', {
      ...apiHandlerDefaults,
      handler: 'data_store.handler',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'data-store')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      logGroup: makeLogGroup('DataStore'),
      environment: { DATA_TABLE: dataTable.tableName, ...commonEnv },
    });
    dataTable.grantReadWriteData(dataStoreFn);

    const assetsFn = new lambda.Function(this, 'AssetsFn', {
      ...apiHandlerDefaults,
      handler: 'assets.handler',
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'assets')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      logGroup: makeLogGroup('Assets'),
      environment: {
        ASSET_BUCKET: assetBucket.bucketName,
        ASSET_TABLE: assetTable.tableName,
        ...commonEnv,
      },
    });
    assetBucket.grantReadWrite(assetsFn);
    assetTable.grantReadWriteData(assetsFn);

    // -------------------------------------------------------------- API Gateway --
    const apiAccessLogs = new logs.LogGroup(this, 'ApiAccessLogs', {
      retention: LOG_RETENTION,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const api = new apigateway.RestApi(this, 'Api', {
      // The deployOptions below turn on stage access logging, execution logging
      // and metrics. API Gateway will only accept those if an account-level
      // CloudWatch Logs role ARN is registered, and cdk.json sets the
      // '@aws-cdk/aws-apigateway:disableCloudWatchRole' feature flag, which
      // suppresses it by default. Without this the stage fails to create with
      // "CloudWatch Logs role ARN must be set in account settings to enable
      // logging". Setting it here makes CDK create the role plus the
      // AWS::ApiGateway::Account singleton and order the stage after it.
      //
      // AWS::ApiGateway::Account is per account and Region, so this setting is
      // shared with any other REST API in the same Region. The DESTROY policy
      // keeps teardown complete; switch it to RETAIN if you later run other
      // REST APIs in this Region that depend on access logging.
      cloudWatchRole: true,
      cloudWatchRoleRemovalPolicy: cdk.RemovalPolicy.DESTROY,
      deployOptions: {
        stageName: 'prod',
        accessLogDestination: new apigateway.LogGroupLogDestination(apiAccessLogs),
        // Records the caller identity for every request. Deliberately excludes the
        // Authorization header and request bodies so no token or prompt is logged.
        accessLogFormat: apigateway.AccessLogFormat.custom(JSON.stringify({
          requestId: apigateway.AccessLogField.contextRequestId(),
          requestTime: apigateway.AccessLogField.contextRequestTime(),
          httpMethod: apigateway.AccessLogField.contextHttpMethod(),
          resourcePath: apigateway.AccessLogField.contextResourcePath(),
          status: apigateway.AccessLogField.contextStatus(),
          responseLatency: apigateway.AccessLogField.contextResponseLatency(),
          callerSub: apigateway.AccessLogField.contextAuthorizerClaims('sub'),
          sourceIp: apigateway.AccessLogField.contextIdentitySourceIp(),
          integrationError: apigateway.AccessLogField.contextIntegrationErrorMessage(),
        })),
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        metricsEnabled: true,
        dataTraceEnabled: false,
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: [webOrigin],
        allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const cognitoAuth = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuth', {
      cognitoUserPools: [userPool],
    });

    const authOpts: apigateway.MethodOptions = {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Request validation caps prompt length, which also bounds Amazon Bedrock cost.
    const bodyValidator = api.addRequestValidator('BodyValidator', {
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    const model = (name: string, required: string[], properties: Record<string, unknown>) =>
      api.addModel(name, {
        contentType: 'application/json',
        modelName: name,
        schema: {
          schema: apigateway.JsonSchemaVersion.DRAFT4,
          type: apigateway.JsonSchemaType.OBJECT,
          // JSON Schema draft-04 defines `required` as an array with minItems 1.
          // API Gateway validates against that metaschema and rejects
          // `"required": []` with "Invalid model schema specified", so the
          // keyword has to be omitted entirely when no field is mandatory
          // (GenerateVideoRequest, where every field is conditional on `action`).
          ...(required.length > 0 ? { required } : {}),
          properties: properties as never,
          additionalProperties: false,
        },
      });

    const promptField = { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 4000 };

    // The optional fields below are exactly the `extraFields` the frontend pages
    // pass to TextGenerator: audience (Email), target_language + target_market
    // (Localization), region + product_category (Packaging). Because the schema
    // sets additionalProperties: false, adding a new extraField in the UI
    // REQUIRES adding it here and to ALLOWED_EXTRAS in text_gen.py, or the API
    // will reject the request with 400.
    const generateTextModel = model('GenerateTextRequest', ['content_type', 'input'], {
      content_type: { type: apigateway.JsonSchemaType.STRING, maxLength: 40 },
      input: promptField,
      audience: { type: apigateway.JsonSchemaType.STRING, maxLength: 200 },
      target_language: { type: apigateway.JsonSchemaType.STRING, maxLength: 120 },
      target_market: { type: apigateway.JsonSchemaType.STRING, maxLength: 120 },
      region: { type: apigateway.JsonSchemaType.STRING, maxLength: 120 },
      product_category: { type: apigateway.JsonSchemaType.STRING, maxLength: 120 },
    });
    const generateImageModel = model('GenerateImageRequest', ['prompt'], {
      prompt: promptField,
      count: { type: apigateway.JsonSchemaType.INTEGER, minimum: 1, maximum: 2 },
      seed: { type: apigateway.JsonSchemaType.INTEGER, minimum: 0, maximum: 2147483647 },
    });
    const generateVideoModel = model('GenerateVideoRequest', [], {
      action: { type: apigateway.JsonSchemaType.STRING, maxLength: 20 },
      prompt: { type: apigateway.JsonSchemaType.STRING, maxLength: 2000 },
      invocation_arn: { type: apigateway.JsonSchemaType.STRING, maxLength: 2048 },
    });
    const generateCampaignModel = model('GenerateCampaignRequest', ['brief'], {
      brief: promptField,
    });

    const validated = (m: apigateway.Model): apigateway.MethodOptions => ({
      ...authOpts,
      requestValidator: bodyValidator,
      requestModels: { 'application/json': m },
    });

    api.root.addResource('generate-image')
      .addMethod('POST', new apigateway.LambdaIntegration(imageGenFn), validated(generateImageModel));
    api.root.addResource('generate-campaign')
      .addMethod('POST', new apigateway.LambdaIntegration(campaignGenFn), validated(generateCampaignModel));
    api.root.addResource('generate-video')
      .addMethod('POST', new apigateway.LambdaIntegration(videoGenFn), validated(generateVideoModel));
    api.root.addResource('generate-text')
      .addMethod('POST', new apigateway.LambdaIntegration(textGenFn), validated(generateTextModel));

    const brandResource = api.root.addResource('brand-profile');
    brandResource.addMethod('GET', new apigateway.LambdaIntegration(brandProfileFn), authOpts);
    brandResource.addMethod('POST', new apigateway.LambdaIntegration(brandProfileFn), authOpts);

    const products = api.root.addResource('products');
    products.addMethod('GET', new apigateway.LambdaIntegration(productCatalogFn), authOpts);
    products.addMethod('POST', new apigateway.LambdaIntegration(productCatalogFn), authOpts);
    const product = products.addResource('{id}');
    product.addMethod('GET', new apigateway.LambdaIntegration(productCatalogFn), authOpts);
    product.addMethod('DELETE', new apigateway.LambdaIntegration(productCatalogFn), authOpts);

    const dataStoreInt = new apigateway.LambdaIntegration(dataStoreFn);
    for (const entity of ['audiences', 'regulatory-rules']) {
      const r = api.root.addResource(entity);
      r.addMethod('GET', dataStoreInt, authOpts);
      r.addMethod('POST', dataStoreInt, authOpts);
      const ri = r.addResource('{id}');
      ri.addMethod('GET', dataStoreInt, authOpts);
      ri.addMethod('DELETE', dataStoreInt, authOpts);
    }

    const assetsInt = new apigateway.LambdaIntegration(assetsFn);
    const assets = api.root.addResource('assets');
    assets.addMethod('GET', assetsInt, authOpts);
    assets.addMethod('POST', assetsInt, authOpts);
    assets.addResource('{id}').addMethod('DELETE', assetsInt, authOpts);

    // Presigned uploads and downloads are issued to the browser, so the media
    // buckets must accept cross-origin requests from the CloudFront origin only.
    // assets.py issues a presigned POST (generate_presigned_post) so that the
    // content type and ContentLengthRange are signed into the policy, and
    // AssetLibrary.jsx submits it as a multipart POST. The allowed method must
    // therefore be POST, not PUT, or the browser blocks the upload on preflight.
    for (const bucket of [imageOutputBucket, videoOutputBucket, assetBucket]) {
      const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
      cfnBucket.corsConfiguration = {
        corsRules: [{
          allowedMethods: bucket === assetBucket ? ['GET', 'POST'] : ['GET'],
          allowedOrigins: [webOrigin],
          allowedHeaders: ['*'],
          maxAge: 3000,
        }],
      };
    }

    // ------------------------------------------------------------ Frontend deploy --
    const uiDist = path.resolve(__dirname, '..', '..', 'dist');
    const uiDeployment = new s3deploy.BucketDeployment(this, 'DeployUI', {
      sources: [s3deploy.Source.asset(uiDist)],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
    });

    const configDeployment = new s3deploy.BucketDeployment(this, 'DeployConfig', {
      sources: [s3deploy.Source.jsonData('config.json', {
        apiUrl: api.url,
        region: this.region,
        userPoolId: userPool.userPoolId,
        userPoolClientId: userPoolClient.userPoolClientId,
      })],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/config.json'],
      prune: false,
    });
    configDeployment.node.addDependency(uiDeployment);

    // ------------------------------------------------------------------- Outputs --
    new cdk.CfnOutput(this, 'WebsiteUrl', { value: webOrigin });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'AdminCredentialSecretArn', {
      value: adminSecret.secretArn,
      // CloudFormation requires an Output description to be a literal string, so
      // this cannot interpolate adminSecret.secretName: that token resolves to a
      // Fn::Select/Fn::Split chain over the ARN. The name is published on its own
      // in the AdminCredentialSecretName output below.
      description: 'Secret holding the initial admin credential. Retrieve it with: '
        + 'aws secretsmanager get-secret-value --secret-id '
        + '<AdminCredentialSecretName> --query SecretString --output text',
    });
    new cdk.CfnOutput(this, 'AdminCredentialSecretName', { value: adminSecret.secretName });
  }
}
