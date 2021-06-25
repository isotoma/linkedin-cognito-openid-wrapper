const axios = require('axios');
const { query } = require('express');
const qs = require('qs');
const {
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  COGNITO_REDIRECT_URI,
  LINKEDIN_API_URL,
  LINKEDIN_LOGIN_URL,
  LINKEDIN_SCOPE,
} = require('./config');
const logger = require('./connectors/logger');

const getApiEndpoints = (
  apiBaseUrl = LINKEDIN_API_URL,
  loginBaseUrl = LINKEDIN_LOGIN_URL
) => ({
  userDetails: `${apiBaseUrl}/v2/me`,
  userEmails: `${apiBaseUrl}/v2/clientAwareMemberHandles?q=members&projection=(elements*(primary,type,handle~))`,
  oauthToken: `${apiBaseUrl}/oauth/v2/accessToken`,
  oauthAuthorize: `${loginBaseUrl}/oauth/v2/authorization`,
});

const check = response => {
  logger.debug('Checking response: %j', response, {});
  if (response.data) {
    if (response.data.error) {
      throw new Error(
        `LinkedIn API responded with a failure: ${response.data.error}, ${
          response.data.error_description
        }`
      );
    } else if (response.status === 200) {
      return response.data;
    }
  }
  throw new Error(
    `LinkedIn API responded with a failure: ${response.status} (${
      response.statusText
    })`
  );
};

const linkedinGet = (url, accessToken) =>
  axios({
    method: 'get',
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    query: {
      projection: '(id,localizedLastName,localizedFirstName,profilePicture(displayImage~:playableStreams))'
    }
  });

module.exports = (apiBaseUrl, loginBaseUrl) => {
  const urls = getApiEndpoints(apiBaseUrl, loginBaseUrl || apiBaseUrl);
  return {
    getAuthorizeUrl: (client_id, scope, state, response_type) => {
      const scopesToSend = scope.split(' ').filter(s => s !== 'openid').join(' ');
      return `${urls.oauthAuthorize}?client_id=${client_id}&scope=${encodeURIComponent(
        scopesToSend
      )}&state=${state}&response_type=${response_type}&redirect_uri=${COGNITO_REDIRECT_URI}`;
    },
    getUserDetails: accessToken =>
      linkedinGet(urls.userDetails, accessToken).then(check),
    getUserEmails: accessToken =>
      linkedinGet(urls.userEmails, accessToken).then(check),
    getToken: (code, state) => {
      const data = {
        // OAuth required fields
        grant_type: 'authorization_code',
        redirect_uri: COGNITO_REDIRECT_URI,
        client_id: LINKEDIN_CLIENT_ID,
        response_type: 'code',
        client_secret: LINKEDIN_CLIENT_SECRET,
        code,
        // State may not be present, so we conditionally include it
        ...(state && { state })
      };

      logger.debug(
        'Getting token from %s with data: %j',
        urls.oauthToken,
        data,
        {}
      );
      return axios.post(
        urls.oauthToken,
        qs.stringify(data),
        {
          headers: {
            Accept: 'application/json',
            // 'Content-Type': 'application/json'
          },
        }
      ).then(check)
        .then(data => {
          // Because LinkedIn doesn't return the scopes
          data.scope = LINKEDIN_SCOPE;
          data.token_type = 'bearer';
          return data;
        })
    }
  };
};
