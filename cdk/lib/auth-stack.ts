import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthStackProps {
  environment: string;
  domainName: string;
}

export class AuthStack extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id);

    const { environment, domainName } = props;

    // Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `smart-cooking-users-${environment}`,
      
      // Sign-in configuration
      signInAliases: {
        email: true,
        username: true
      },
      
      // Self sign-up configuration
      selfSignUpEnabled: true,
      autoVerify: {
        email: true
      },
      
      // Password policy
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false
      },
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Custom attributes
      customAttributes: {
        role: new cognito.StringAttribute({
          maxLen: 20,
          mutable: true
        }),
        username: new cognito.StringAttribute({
          maxLen: 50,
          mutable: true
        })
      },
      
      // Standard attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        },
        givenName: {
          required: false,
          mutable: true
        },
        familyName: {
          required: false,
          mutable: true
        },
        birthdate: {
          required: false,
          mutable: true
        },
        gender: {
          required: false,
          mutable: true
        }
      },
      
      // Email configuration
      email: cognito.UserPoolEmail.withCognito(),
      
      // Removal policy
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY
    });

    // User Pool Client (for web application)
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `smart-cooking-web-client-${environment}`,
      
      // Auth flows
      authFlows: {
        userSrp: true,
        userPassword: false, // Disable for security
        adminUserPassword: false
      },
      
      // OAuth configuration
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE
        ],
        callbackUrls: [
          `https://${domainName}/auth/callback`,
          'http://localhost:3000/auth/callback' // For local development
        ],
        logoutUrls: [
          `https://${domainName}/auth/logout`,
          'http://localhost:3000/auth/logout'
        ]
      },
      
      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      
      // Prevent user existence errors
      preventUserExistenceErrors: true,
      
      // Read and write attributes
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
          birthdate: true,
          gender: true
        })
        .withCustomAttributes('role', 'username'),
      
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
          birthdate: true,
          gender: true
        })
        .withCustomAttributes('role', 'username')
    });

    // User Pool Domain (for hosted UI)
    const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: `smart-cooking-${environment}-${Math.random().toString(36).substring(2, 8)}`
      }
    });

    // Identity Pool for AWS resource access
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `smart_cooking_identity_pool_${environment}`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
        serverSideTokenCheck: true
      }]
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `SmartCooking-${environment}-UserPoolId`
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `SmartCooking-${environment}-UserPoolClientId`
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: userPoolDomain.domainName,
      description: 'Cognito User Pool Domain',
      exportName: `SmartCooking-${environment}-UserPoolDomain`
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `SmartCooking-${environment}-IdentityPoolId`
    });

    // Tags
    cdk.Tags.of(this.userPool).add('Component', 'Authentication');
    cdk.Tags.of(this.identityPool).add('Component', 'Authentication');
  }
}