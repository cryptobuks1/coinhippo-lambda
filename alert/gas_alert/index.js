/************************************************
 * This code is a function for retrieve gas data from etherscan API to post on social.
 * Deploy on AWS Lambda (triggered by AWS EventBridge)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // import modules
  const _ = require('lodash');
  const moment = require('moment');

  // output data
  const telegramData = [];
  const twitterData = [];
  const feedsData = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const poster_api_host = process.env.POSTER_API_HOST || '{YOUR_POSTER_API_HOST}';
  const dynamodb_api_host = process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}';
  const dynamodb_table_name = process.env.DYNAMODB_TABLE_NAME || 'coinhippo-feeds';
  const dynamodb_feeds_type = 'gas';
  const website_url = process.env.WEBSITE_URL || 'https://coinhippo.io';
  const gas_gwei_threshold = Number(process.env.GAS_GWEI_THRESHOLD) || 15;
  const gas_source_url = process.env.GAS_SOURCE_URL || 'https://etherscan.io/gastracker';
  const gas_source_name = process.env.GAS_SOURCE_NAME || 'Etherscan';

  // initial requester object
  const requester = axios.create({ baseURL: api_host });

  // function to request data from etherscan API on AWS by passing 2 arguments (path, params)
  const request = async (path, params) => {
    // response data variable
    let response = null;

    try {
      // send request to your API
      const res = await requester.get('', { params: { api_name: 'etherscan', path, ...(params || {}) } })
        // set response data from error handled by exception
        .catch(error => { return { data: { result: null, status: 0, message: error.message } }; });

      // set response data
      if (res && res.data) {
        response = res.data;
      }
    } catch (error) {
      // set response data from error handled by exception
      response = { result: null, status: 0, message: error.message };
    }

    // return response data
    return response;
  };

  // response data variable
  let response = null;

  // initial path parameter
  let path = null;

  // initial params parameter
  let params = null;

  path = '';
  params = { module: 'gastracker', action: 'gasoracle' };
  response = await request(path, params);
  const gasData = response && response.result;

  // average gas price for calculate
  const avgGas = _.mean([gasData.SafeGasPrice, gasData.ProposeGasPrice, gasData.FastGasPrice].map(gas => Number(gas)));

  // process gas data
  if (gasData && avgGas <= gas_gwei_threshold) {
    const message =`The ⛽ ETH Gas is ${avgGas <= gas_gwei_threshold * 2 / 3 ? 'very low' : 'not high'}.\nMaybe it's time to <a href="${website_url}/coins/decentralized-finance-defi">DeFi</a> or <a href="${website_url}/coins/non-fungible-tokens-nft">NFTs</a>. 😁👍\n<pre>Low: ${gasData.SafeGasPrice} Gwei</pre>\n<pre>Average: ${gasData.ProposeGasPrice} Gwei</pre>\n<pre>High: ${gasData.FastGasPrice} Gwei</pre>`;

    // add message
    telegramData.push(message);

    const data = { ...gasData, avgGas, gas_gwei_threshold, url: gas_source_url, source_name: gas_source_name };

    const id = `${dynamodb_feeds_type}_${moment().unix()}`;

    // add feed
    feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(data) });

    const twitterMessage = `The ⛽ ETH Gas is ${avgGas <= gas_gwei_threshold * 2 / 3 ? 'very low' : 'not high'}.\nMaybe it's time to #DeFi or #NFTs. 😁👍\nLow: ${gasData.SafeGasPrice} Gwei\nAverage: ${gasData.ProposeGasPrice} Gwei\nHigh: ${gasData.FastGasPrice} Gwei\n\n #Etherscan #Ether #EtherGas #Ethereum #Crypto #Cryptocurrency`;

    // add message and data
    twitterData.push({
      id,
      text: twitterMessage,
      data: [gasData].map(x => {
        return {
          ...x,
        };
      }),
    });
  }

  // save feeds data to dynamodb
  if (feedsData.length > 0) {
    for (let i = 0; i < feedsData.length; i++) {
      const feedData = feedsData[i];

      try {
        const saveResponse = await axios.post(
          dynamodb_api_host, {
            table_name: dynamodb_table_name,
            method: 'put',
            ...feedData,
          }
        ).catch(error => error);

        if (saveResponse.data && saveResponse.data.SortKey && feedData.id && twitterData && twitterData.findIndex(_twitterData => _twitterData.id === feedData.id) > -1) {
          const _twitterData = twitterData[twitterData.findIndex(_twitterData => _twitterData.id === feedData.id)];
          if (_twitterData.data[0]) {
            _twitterData.data[0].widget_url = `${website_url}/feeds?view=widget&id=${saveResponse.data.SortKey}`;
            twitterData[twitterData.findIndex(_twitterData => _twitterData.id === feedData.id)] = _twitterData;
          }
        }
      } catch (error) {}
    }
  }

  // post data to social poster
  if (telegramData.length > 0 || twitterData.length > 0) {
    try {
      await axios.post(poster_api_host, { telegram: telegramData, twitter: twitterData })
        .catch(error => error);
    } catch (error) {}
  }

  // return data
  return {
    telegram: {
      data: telegramData,
    },
    twitter: {
      data: twitterData,
    },
    feeds: {
      data: feedsData,
    },
  };
};