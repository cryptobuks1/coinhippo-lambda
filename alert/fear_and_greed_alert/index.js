/************************************************
 * This code is a function for retrieve fear and greed index from alternative.me crypto API to post on social.
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
  const low_threshold = Number(process.env.LOW_THRESHOLD) || 20;
  const high_threshold = Number(process.env.HIGH_THRESHOLD) || 75;
  const source_url = process.env.SOURCE_URL || 'https://alternative.me/crypto/fear-and-greed-index';
  const source_name = process.env.SOURCE_NAME || 'alternative.me';

  // initial requester object
  const requester = axios.create({ baseURL: api_host });

  // function to request data from fear and greed API on AWS by passing 2 arguments (path, params)
  const request = async (path, params) => {
    // response data variable
    let response = null;

    try {
      // send request to your API
      const res = await requester.get('', { params: { api_name: 'fear_and_greed', path, ...(params || {}) } })
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
  params = { limit: 31 };
  response = await request(path, params);
  const fearAndGreedData = response && response.data;

  // process fear and greed data
  if (fearAndGreedData.length > 0) {
    if (fearAndGreedData[0]) {
      const value = Number(fearAndGreedData[0].value);

      if (value <= low_threshold || value >= high_threshold) {
        const message = `Today's <b>Bitcoin Fear and Greed index</b> is <b>${value}</b> - <b>${fearAndGreedData[0].value_classification}</b> ${value <= low_threshold ? '😰' : '🤩'}\n\nData from <a href="${source_url}">${source_name}</a>`;

        // add message
        telegramData.push(message);
      }
    }
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