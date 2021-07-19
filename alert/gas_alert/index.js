/************************************************
 * This code is a function for retrieve gas data from etherscan API to post on social.
 * Deploy on AWS Lambda (triggered by AWS EventBridge)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // output data
  const telegramData = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const poster_api_host = process.env.POSTER_API_HOST || '{YOUR_POSTER_API_HOST}';
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

  // process gas data
  if (gasData && gasData.ProposeGasPrice <= gas_gwei_threshold) {
    const message =`The <b>⛽ ETH Gas</b> is ${gasData.ProposeGasPrice <= gas_gwei_threshold * 0.66 ? 'very low' : 'not high'}. Maybe it's time to <b><a href="${website_url}/coins/defi">DeFi</a></b> or <b><a href="${website_url}/coins/nfts">NFTs</a></b>. 😁👍\nLow: <b>${gasData.SafeGasPrice}</b> Gwei\nAverage: <b>${gasData.ProposeGasPrice}</b> Gwei\nHigh: <b>${gasData.FastGasPrice}</b> Gwei\n\nData from <a href="${gas_source_url}">${gas_source_name}</a>`;

    // add message
    telegramData.push(message);
  }

  // post data to social poster
  if (telegramData.length > 0) {
    try {
      await axios.post(poster_api_host, { telegram: telegramData })
        .catch(error => error);
    } catch (error) {}
  }

  // return data
  return {
    telegram: {
      data: telegramData,
    },
  };
};