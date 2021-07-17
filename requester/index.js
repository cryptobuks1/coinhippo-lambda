/************************************************
 * This code is a function for request data from APIs.
 * Deploy on AWS Lambda (triggered by AWS API Gateway)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  /************************************************
   * External API information for requesting data
   * You can setup these environment variables below on the AWS Lambda function's configuration.
   ************************************************/
  const env = {
    fear_and_greed: {
      api_host: process.env.FEAR_AND_GREED_API_HOST || 'https://api.alternative.me/',
    },
    news: {
      api_host: process.env.NEWS_API_HOST || 'https://cryptopanic.com/api/v1/',
      api_key: process.env.NEWS_API_KEY || '{YOUR_NEWS_API_KEY}',
    },
    etherscan: {
      api_host: process.env.ETHERSCAN_API_HOST || 'https://api.etherscan.io/api/',
      api_key: process.env.ETHERSCAN_API_KEY || '{YOUR_ETHERSCAN_API_KEY}',
    },
    coingecko: {
      api_host: process.env.COINGECKO_API_HOST || 'https://api.coingecko.com/api/v3/',
    },
    covalent: {
      api_host: process.env.COVALENT_API_HOST || 'https://api.covalenthq.com/v1/',
      api_key: process.env.COVALENT_API_KEY || '{YOUR_COVALENT_API_KEY}',
    },
    whale_alert: {
      api_host: process.env.WHALE_ALERT_API_HOST || 'https://api.whale-alert.io/v1/',
      api_key: process.env.WHALE_ALERT_API_KEY || '{YOUR_WHALE_ALERT_API_KEY}',
    },
  };

  // response data variable
  let response = null;

  // check api_name parameter exist
  if (event.queryStringParameters && event.queryStringParameters.api_name && Object.keys(env).indexOf(event.queryStringParameters.api_name.trim().toLowerCase()) > -1) {
    // normalize api_name parameter
    const apiName = event.queryStringParameters.api_name.trim().toLowerCase();
    // remove api_name parameter before setup query string parameters
    delete event.queryStringParameters.api_name;

    // initial requester object
    const requester = axios.create({ baseURL: env[apiName].api_host });

    // initial response object
    let res = null;

    // initial path parameter
    let path = event.queryStringParameters.path;
    // remove path parameter (if exist) before setup query string parameters
    if (path) {
      delete event.queryStringParameters.path;
    }

    // initial params parameter
    let params = null;

    // seperate each api
    switch (apiName) {
      case 'fear_and_greed':
        // normalize path parameter
        path = path || '/fng/';
        // setup query string parameters including limit
        params = { limit: 31, ...event.queryStringParameters };

        // send request
        res = await requester.get(path, { params })
          // set response data from error handled by exception
          .catch(error => { return { data: { data: null, metadata: { error } } }; });
        break;
      case 'news':
        // normalize path parameter
        path = path || '/posts/';
        path = `${path}${!path.endsWith('/') ? '/' : ''}`;
        // setup query string parameters including API key
        params = { auth_token: env[apiName].api_key, ...event.queryStringParameters };

        // send request
        res = await requester.get(path, { params })
          // set response data from error handled by exception
          .catch(error => { return { data: { results: null, error } }; });
        break;
      case 'etherscan':
        // normalize path parameter
        path = path || '';
        // setup query string parameters including API key
        params = { apikey: env[apiName].api_key, ...event.queryStringParameters };

        // send request
        res = await requester.get(path, { params })
          // set response data from error handled by exception
          .catch(error => { return { data: { result: null, status: 0, message: error.message } }; });
        break;
      case 'coingecko':
        // normalize path parameter
        path = path || '';
        // setup query string parameters including limit
        params = { ...event.queryStringParameters };

        // send request
        res = await requester.get(path, { params })
          // set response data from error handled by exception
          .catch(error => { return { data: { error } }; });
        break;
      case 'covalent':
        // normalize path parameter
        path = path || '';
        path = `${path}${!path.endsWith('/') ? '/' : ''}`;
        // setup query string parameters including API key
        params = { key: env[apiName].api_key, ...event.queryStringParameters };

        // send request
        res = await requester.get(path, { params })
          // set response data from error handled by exception
          .catch(error => { return { data: { data: null, error: true, error_message: error.message, error_code: error.code } }; });
        break;
      case 'whale_alert':
        // normalize path parameter
        path = path || '/transactions';
        // setup query string parameters including API key
        params = { api_key: env[apiName].api_key, ...event.queryStringParameters };

        // send request
        res = await requester.get(path, { params })
          // set response data from error handled by exception
          .catch(error => { return { data: { error } }; });
        break;
      default: // do nothing
    }

    // set response data
    if (res && res.data) {
      response = res.data;
    }
  }

  // return response data
  return response;
};