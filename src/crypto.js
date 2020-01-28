const JSONWebKey = require('json-web-key');
const jwt = require('jsonwebtoken');
const { LINKEDIN_CLIENT_ID } = require('./config');
const logger = require('./connectors/logger');

const KEY_ID = 'jwtRS256';
const cert = require('../jwtRS256.key');
const pubKey = require('../jwtRS256.key.pub');

module.exports = {
  getPublicKey: () => ({
    alg: 'RS256',
    kid: KEY_ID,
    ...JSONWebKey.fromPEM(pubKey).toJSON()
  }),

  makeIdToken: (payload, host) => {
    const enrichedPayload = {
      ...payload,
      iss: `https://${host}`,
      aud: LINKEDIN_CLIENT_ID
    };
    logger.debug('Signing payload %j', enrichedPayload, {});
    return jwt.sign(enrichedPayload, cert, {
      expiresIn: '1h',
      algorithm: 'RS256',
      keyid: KEY_ID
    });
  }
};
