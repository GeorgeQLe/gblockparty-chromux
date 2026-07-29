'use strict';

const path = require('path');

const TIMESTAMP_SERVER = 'http://timestamp.acs.microsoft.com';

function quoteSignToolArgument(value) {
  const text = String(value || '');
  if (!text || /[\r\n"]/u.test(text)) throw new Error('Windows signing path is missing or invalid.');
  return `"${text}"`;
}

function windowsSignOptions(env = process.env) {
  const dlib = env.AZURE_CODE_SIGNING_DLIB;
  const metadata = env.AZURE_CODE_SIGNING_METADATA;
  const required = env.CHROMUX_REQUIRE_WINDOWS_SIGNING === '1';
  if (!dlib || !metadata) {
    if (required) {
      throw new Error('Signed Windows builds require AZURE_CODE_SIGNING_DLIB and AZURE_CODE_SIGNING_METADATA.');
    }
    return null;
  }
  const options = {
    ...(env.SIGNTOOL_PATH ? { signToolPath: path.resolve(env.SIGNTOOL_PATH) } : {}),
    signWithParams: [
      '/v',
      '/debug',
      '/fd SHA256',
      `/tr ${quoteSignToolArgument(TIMESTAMP_SERVER)}`,
      '/td SHA256',
      `/dlib ${quoteSignToolArgument(path.resolve(dlib))}`,
      `/dmdf ${quoteSignToolArgument(path.resolve(metadata))}`,
    ].join(' '),
    timestampServer: TIMESTAMP_SERVER,
    hashes: ['sha256'],
    description: 'GBlockParty Chromux',
    website: 'https://github.com/GeorgeQLe/gblockparty-chromux',
  };
  return Object.freeze(options);
}

module.exports = { TIMESTAMP_SERVER, quoteSignToolArgument, windowsSignOptions };
