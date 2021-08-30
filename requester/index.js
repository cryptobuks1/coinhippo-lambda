/************************************************
 * This code is a function for request data from APIs.
 * Deploy on AWS Lambda (triggered by AWS API Gateway)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // import modules
  const { parachains } = require('./data');
  const moment = require('moment');

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
    coinmarketcap: {
      api_host: process.env.COINMARKETCAP_API_HOST || 'https://api.coinmarketcap.com/data-api/v3/',
      api_key: process.env.COINMARKETCAP_API_KEY || '{YOUR_COINMARKETCAP_API_KEY}',
    },
    subscan: {
      api_host: process.env.SUBSCAN_API_HOST || 'https://{chain}.api.subscan.io/api/',
      api_key: process.env.SUBSCAN_API_KEY || '{YOUR_SUBSCAN_API_KEY}',
    },
    cache: {
      api_host: process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}',
      table_name: process.env.DYNAMODB_CACHE_TABLE_NAME || '{YOUR_DYNAMODB_CACHE_TABLE_NAME}',
    },
    feeds: {
      api_host: process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}',
      table_name: process.env.DYNAMODB_FEEDS_TABLE_NAME || '{YOUR_DYNAMODB_FEEDS_TABLE_NAME}',
    },
    watchlist: {
      api_host: process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}',
      table_name: process.env.DYNAMODB_WATCHLIST_TABLE_NAME || '{YOUR_DYNAMODB_WATCHLIST_TABLE_NAME}',
    },
    analytics: {
      api_host: process.env.ANALYTICS_API_HOST || '{YOUR_ANALYTICS_API_HOST}',
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

    // normalize chain parameter
    const chain = event.queryStringParameters.chain && event.queryStringParameters.chain.trim().toLowerCase();
    // remove chain parameter before setup query string parameters
    delete event.queryStringParameters.chain;

    // initial requester object
    const requester = axios.create({ baseURL: env[apiName].api_host.replace('{chain}', chain) });

    // initial response object
    let res = null;
    let resCache = null;

    // initial path parameter
    let path = event.queryStringParameters.path;
    // remove path parameter (if exist) before setup query string parameters
    if (path) {
      delete event.queryStringParameters.path;
    }

    // initial cacher object
    const cacher = axios.create({ baseURL: env.cache.api_host });

    // generate url string
    const generateUrl = (url, params, paramsFilterOut) => {
      url = url || '/';

      return [url, Object.entries({ ...params }).filter(([param, value]) => !(paramsFilterOut && paramsFilterOut.includes(param))).map(entry => entry.join('=')).join('&')].filter(urlPart => urlPart).join('?');
    };

    // get cache
    const getCache = async id => await cacher.get('', { params: { table_name: env.cache.table_name, method: 'get', ID: id } })
      .catch(error => { return { data: null }; });

    // set cache
    const setCache = async data => await cacher.post('', { table_name: env.cache.table_name, method: 'put', ...data })
      .catch(error => { return { data: null }; });

    // initial params parameter
    let params = null;

    // declare id
    let id;

    // initial current time
    const time = moment();

    // seperate each api
    switch (apiName) {
      case 'fear_and_greed':
        // normalize path parameter
        path = path || '/fng/';
        // setup query string parameters including limit
        params = { limit: 31, ...event.queryStringParameters };

        // generate id
        id = `${apiName}_${generateUrl(path, params)}`;

        // get cache
        resCache = await getCache(id);

        // check cache
        if (resCache && resCache.data && resCache.data.data && resCache.data.data.Json && resCache.data.data.Expired > time.valueOf()) {
          res = { data: JSON.parse(resCache.data.data.Json) };
        }
        else {
          // send request
          res = await requester.get(path, { params })
            // set response data from error handled by exception
            .catch(error => { return { data: { data: null, metadata: { error } } }; });

          if (res && res.data && res.data.data) {
            // set cache
            await setCache({ ID: id, API: apiName, Expired: moment(time).add(12, 'hour').valueOf(), Json: JSON.stringify(res.data) });
          }
        }
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

        // generate id
        id = `${apiName}_${generateUrl(path, params, ['apikey'])}`;

        // get cache
        resCache = await getCache(id);

        // check cache
        if (resCache && resCache.data && resCache.data.data && resCache.data.data.Json && resCache.data.data.Expired > time.valueOf()) {
          res = { data: JSON.parse(resCache.data.data.Json) };
        }
        else {
          // send request
          res = await requester.get(path, { params })
            // set response data from error handled by exception
            .catch(error => { return { data: { result: null, status: 0, message: error.message } }; });

          if (res && res.data && res.data.result) {
            // set cache
            await setCache({ ID: id, API: apiName, Expired: moment(time).add(20, 'second').valueOf(), Json: JSON.stringify(res.data) });
          }
        }
        break;
      case 'coingecko':
        // normalize path parameter
        path = path || '';
        // setup query string parameters including limit
        params = { ...event.queryStringParameters };

        // declare cache routes
        const cacheRoutes = ['/search', '/coins/categories/list', '/search/trending', '/derivatives', '/exchanges', '/derivatives/exchanges'];
        const cacheContainRoutes = ['/companies/public_treasury/'];

        // check need cache
        const needCache = cacheRoutes.includes(path) || cacheContainRoutes.findIndex(route => path.includes(route)) > -1;

        if (needCache) {
          // generate id
          id = `${apiName}_${generateUrl(path, params)}`;

          // get cache
          resCache = await getCache(id);
        }

        // check cache
        if (needCache && resCache && resCache.data && resCache.data.data && resCache.data.data.Json && resCache.data.data.Expired > time.valueOf()) {
          res = { data: JSON.parse(resCache.data.data.Json) };
        }
        else {
          // send request
          res = await requester.get(path, { params })
            // set response data from error handled by exception
            .catch(error => { return { data: { error } }; });

          if (needCache && res && res.data && !res.data.error) {
            let expired;

            switch (path) {
              case '/search':
              case '/coins/categories/list':
                expired = moment(time).add(1, 'day').valueOf();
                break;
              case '/exchange_rates':
              case '/global':
              case '/global/decentralized_finance_defi':
              case '/simple/price':
              case '/coins/markets':
              case '/coins/categories':
                expired = moment(time).add(1, 'minute').valueOf();
                break;
              case '/search/trending':
              case '/derivatives':
              case '/exchanges':
              case '/derivatives/exchanges':
                expired = moment(time).add(5, 'minute').valueOf();
                break;
              default:
                if (path.startsWith('/companies/public_treasury/')) {
                  expired = moment(time).add(1, 'hour').valueOf();
                }
                else {
                  expired = moment(time).add(1, 'minute').valueOf();
                }
            }

            // set cache
            await setCache({ ID: id, API: apiName, Expired: expired, Json: JSON.stringify(res.data) });
          }
        }
        break;
      case 'covalent':
        // normalize path parameter
        path = path || '';
        path = `${path}${!path.endsWith('/') ? '/' : ''}`;
        // setup query string parameters including API key
        params = { key: env[apiName].api_key, ...event.queryStringParameters };

        // generate id
        id = `${apiName}_${generateUrl(path, params, ['key'])}`;

        // get cache
        resCache = await getCache(id);

        // check cache
        if (resCache && resCache.data && resCache.data.data && resCache.data.data.Json && resCache.data.data.Expired > time.valueOf()) {
          res = { data: JSON.parse(resCache.data.data.Json) };
        }
        else {
          // send request
          res = await requester.get(path, { params })
            // set response data from error handled by exception
            .catch(error => { return { data: { data: null, error: true, error_message: error.message, error_code: error.code } }; });

          if (res && res.data && res.data.data) {
            // set cache
            await setCache({ ID: id, API: apiName, Expired: moment(time).add(1, 'minute').valueOf(), Json: JSON.stringify(res.data) });
          }
        }
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
      case 'coinmarketcap':
        // normalize path parameter
        path = path || '';
        // setup query string parameters including limit
        params = { ...event.queryStringParameters };

        // send request
        res = await requester.get(path, { params, headers: { 'X-CMC_PRO_API_KEY': env[apiName].api_key } })
          // set response data from error handled by exception
          .catch(error => { return { data: { data: null, status: { error_message: error.message, error_code: error.code } } }; });
        break;
      case 'subscan':
        // normalize path parameter
        path = path || '';
        // setup query string parameters including limit
        params = Object.fromEntries(new Map(Object.entries(event.queryStringParameters).map(([key, value]) => [key, !isNaN(value) ? Number(value) : (value && value.includes(',')) || ['status'].includes(key) ? value.split(',') : value])));

        // generate id
        id = `${apiName}_${generateUrl(path, params)}`;

        // get cache
        resCache = await getCache(id);

        // check cache
        if (resCache && resCache.data && resCache.data.data && resCache.data.data.Json && resCache.data.data.Expired > time.valueOf()) {
          res = { data: JSON.parse(resCache.data.data.Json) };
        }
        else {
          // send request
          res = await requester.post(path, { ...params }, { headers: { 'X-API-Key': env[apiName].api_key } })
            // set response data from error handled by exception
            .catch(error => { return { data: { data: null, message: error.message, code: error.code } }; });

          // custom project data
          if (path === '/scan/parachain/list' && res && res.data && res.data.data && res.data.data.chains) {
            res.data.data.chains = res.data.data.chains.map(projectData => {
              const paraData = (parachains[chain] && parachains[chain][projectData.para_id]) || {};
              const { name, image, symbol } = { ...paraData };

              return { ...projectData, name, image, symbol, paraData };
            });
          }

          if (res && res.data && res.data.data) {
            // set cache
            await setCache({ ID: id, API: apiName, Expired: moment(time).add(5, 'minute').valueOf(), Json: JSON.stringify(res.data) });
          }
        }
        break;
      case 'feeds':
      case 'watchlist':
        // normalize path parameter
        path = path || '';
        // setup query string parameters including API key
        params = { table_name: env[apiName].table_name, ...event.queryStringParameters };

        // send request
        res = await requester.get(path, { params })
          // set response data from error handled by exception
          .catch(error => { return { data: { data: null, error } }; });
        break;
      case 'analytics':
        // normalize path parameter
        path = path || '';
        // setup query string parameters including limit
        params = { ...event.queryStringParameters, path };

        // send request
        res = await requester.get('', { params })
          // set response data from error handled by exception
          .catch(error => { return { data: { data: null, error } }; });
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