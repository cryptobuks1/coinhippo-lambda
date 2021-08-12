/************************************************
 * This code is a function for retrieve fear and greed index from alternative.me crypto API to post on social.
 * Deploy on AWS Lambda (triggered by AWS EventBridge)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // output data
  const telegramData = [];
  const twitterData = [];
  const feedsData = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const poster_api_host = process.env.POSTER_API_HOST || '{YOUR_POSTER_API_HOST}';
  const dynamodb_api_host = process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}';
  const dynamodb_table_name = process.env.DYNAMODB_TABLE_NAME || 'coinhippo-feeds';
  const dynamodb_feeds_type = 'fear_and_greed';
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
      const data = { ...fearAndGreedData[0], low_threshold, high_threshold, url: source_url, source_name };
      const value = Number(data.value);

      // if (value <= low_threshold || value >= high_threshold) {
        const message = `Today's Bitcoin Fear & Greed Index is <pre>${value}</pre> - <u>${data.value_classification}</u>${value <= low_threshold ? ' 🥶' : value >= high_threshold ? ' 🤩' : ''}`;

        // add message
        telegramData.push(message);

        const id = `${dynamodb_feeds_type}_${data.timestamp}`;

        // add feed
        feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(data) });

        const twitterMessage = `Today's #Bitcoin Fear & Greed Index is ${value} - ${data.value_classification}${value <= low_threshold ? ' 🥶' : value >= high_threshold ? ' 🤩' : ''}\n\n#Crypto #Cryptocurrency`;

        // add message and data
        twitterData.push({
          id,
          text: twitterMessage,
          data: [fearAndGreedData[0]].map(x => {
            return {
              ...x,
            };
          }),
        });
      // }
    }
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