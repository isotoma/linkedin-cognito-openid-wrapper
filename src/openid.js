const logger = require('./connectors/logger');
const { NumericDate } = require('./helpers');
const crypto = require('./crypto');
const linkedin = require('./linkedin');

const getJwks = () => ({ keys: [crypto.getPublicKey()] });

const getUserInfo = accessToken =>
  Promise.all([
    linkedin()
      .getUserDetails(accessToken)
      .then(userDetails => {
        logger.debug('Fetched user details: %j', userDetails, {});
        // Here we map the linkedin user response to the standard claims from
        // OpenID. The mapping was constructed by following
        // https://docs.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api?context=linkedin/consumer/context
        // and
        // https://docs.microsoft.com/en-us/linkedin/shared/references/v2/profile/lite-profile
        const claims = {
          sub: `${userDetails.id}`, // OpenID requires a string
          firstName: `${userDetails.localizedFirstName}`,
          lastName: `${userDetails.localizedLastName}`,
          picture: `${JSON.stringify(userDetails.profilePicture)}`

          // ?.['displayImage~']?.elements[0]?.identifiers[0]?.identifier

        };
        logger.debug('Resolved claims: %j', claims, {});
        return claims;
      }),
    linkedin()
      .getUserEmails(accessToken)
      .then(userEmails => {
        logger.debug('Fetched user emails: %j', userEmails, {});
        const primaryEmail = userEmails.elements.find(email => email.primary && (email.type === 'EMAIL'));
        if (primaryEmail === undefined) {
          throw new Error('User did not have a primary email address');
        }
        const emailAddress = primaryEmail['handle~'].emailAddress;
        const claims = {
          email: emailAddress,
          email_verified: true,
        };
        logger.debug('Resolved claims: %j', claims, {});
        return claims;
      })
  ]).then(claims => {
    const mergedClaims = claims.reduce(
      (acc, claim) => ({ ...acc, ...claim }),
      {}
    );
    logger.debug('Resolved combined claims: %j', mergedClaims, {});
    return mergedClaims;
  });

const getAuthorizeUrl = (client_id, scope, state, response_type) =>
  linkedin().getAuthorizeUrl(client_id, scope, state, response_type);

const getTokens = (code, state, host) =>
  linkedin()
    .getToken(code, state)
    .then(linkedinToken => {
      logger.debug('Got token: %s', linkedinToken, {});
      // ** JWT ID Token required fields **
      // iss - issuer https url
      // aud - audience that this token is valid for (LINKEDIN_CLIENT_ID)
      // sub - subject identifier - must be unique
      // ** Also required, but provided by jsonwebtoken **
      // exp - expiry time for the id token (seconds since epoch in UTC)
      // iat - time that the JWT was issued (seconds since epoch in UTC)

      return new Promise(resolve => {
        const payload = {
          // This was commented because Cognito times out in under a second
          // and generating the userInfo takes too long.
          // It means the ID token is empty except for metadata.
          //  ...userInfo,
        };

        const idToken = crypto.makeIdToken(payload, host);
        const tokenResponse = {
          ...linkedinToken,
          id_token: idToken
        };

        logger.debug('Resolved token response: %j', tokenResponse, {});

        resolve(tokenResponse);
      });
    });

const getConfigFor = host => ({
  issuer: `https://${host}`,
  authorization_endpoint: `https://${host}/authorize`,
  token_endpoint: `https://${host}/token`,
  token_endpoint_auth_methods_supported: [
    'client_secret_basic',
    'private_key_jwt'
  ],
  token_endpoint_auth_signing_alg_values_supported: ['RS256'],
  userinfo_endpoint: `https://${host}/userinfo`,
  // check_session_iframe: 'https://server.example.com/connect/check_session',
  // end_session_endpoint: 'https://server.example.com/connect/end_session',
  jwks_uri: `https://${host}/.well-known/jwks.json`,
  // registration_endpoint: 'https://server.example.com/connect/register',
  scopes_supported: ['openid', 'read:user', 'user:email'],
  response_types_supported: [
    'code',
    'code id_token',
    'id_token',
    'token id_token'
  ],

  subject_types_supported: ['public'],
  userinfo_signing_alg_values_supported: ['none'],
  id_token_signing_alg_values_supported: ['RS256'],
  request_object_signing_alg_values_supported: ['none'],
  display_values_supported: ['page', 'popup'],
  claims_supported: [
    'sub',
    'firstName',
    'lastName',
    'picture',
    'email',
    'email_verified',
  ]
});

module.exports = {
  getTokens,
  getUserInfo,
  getJwks,
  getConfigFor,
  getAuthorizeUrl
};
