/************************************************
 * This code is a function for retrieve news data from cryptopanic API to post on social.
 * Deploy on AWS Lambda (triggered by AWS EventBridge)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // import modules
  const _ = require('lodash');
  const moment = require('moment');
  const AWS = require('aws-sdk');

  // output data
  const telegramData = [];
  const feedsData = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const poster_api_host = process.env.POSTER_API_HOST || '{YOUR_POSTER_API_HOST}';
  const dynamodb_api_host = process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}';
  const dynamodb_table_name = process.env.DYNAMODB_TABLE_NAME || 'coinhippo-feeds';
  const dynamodb_feeds_type = 'news';
  // aws for save latest news
  AWS.config.update({
    accessKeyId: process.env.NEWS_AWS_ACCESS_KEY_ID || '{YOUR_NEWS_AWS_ACCESS_KEY_ID}',
    secretAccessKey: process.env.NEWS_AWS_SECRET_ACCESS_KEY || '{YOUR_NEWS_AWS_SECRET_ACCESS_KEY}',
    region: process.env.NEWS_AWS_REGION || 'us-east-1',
  });
  // aws s3
  const aws_s3_bucket = process.env.NEWS_AWS_S3_BUCKET || '{YOUR_NEWS_AWS_S3_BUCKET}';
  const aws_s3_bucket_key = process.env.NEWS_AWS_S3_BUCKET_KEY || '{YOUR_NEWS_AWS_S3_BUCKET_KEY}';
  const s3 = new AWS.S3();
  // current time object
  const now = moment();
  // news filter
  const filters = ['rising','hot','bullish','bearish','important','lol'];

  // initial requester object
  const requester = axios.create({ baseURL: api_host });

  // function to request data from news API on AWS by passing 2 arguments (path, params)
  const request = async (path, params) => {
    // response data variable
    let response = null;

    try {
      // send request to your API
      const res = await requester.get('', { params: { api_name: 'news', path, ...(params || {}) } })
        // set response data from error handled by exception
        .catch(error => { return { data: { results: null, error } }; });

      // set response data
      if (res && res.data) {
        response = res.data;
      }
    } catch (error) {
      // set response data from error handled by exception
      response = { results: null, error };
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

  path = '/posts';
  params = { public: true, page: 1 };

  // news data
  let newsData = [];

  for (i = 0; i < filters.length; i++) {
    // request news
    params.filter = filters[i];
    response = await request(path, params);
	  
	  // merge news data
	  newsData = _.orderBy(_.uniqBy(newsData.concat(response && response.results ? response.results : []), 'id'), ['created_at'], ['desc']);
  }

  // process news data
  if (newsData && newsData.length > 0) {
  	// get latest news id from aws s3
    const latestId = await new Promise(resolve => s3.getObject({
      Bucket: aws_s3_bucket,
      Key: aws_s3_bucket_key
    }, (err, data) => resolve(data && data.Body ? data.Body.toString() : null)));

    // filter new data
    newsData = newsData.filter(d => d.title && d.url && d.source && d.created_at && now.diff(moment(d.created_at)) <= (4 * 60 * 60 * 1000));

    // filter data before latest out
    const latestIndex = newsData.findIndex(d => d.id && d.id.toString() === latestId);
    if (latestIndex > -1) {
      newsData = _.cloneDeep(_.slice(newsData, 0, latestIndex)).reverse();
    }

    // filter only first nearby latest news
    newsData = _.slice(newsData, 0, 1);

    newsData.forEach(d => {
      d.url = d.url.replace(d.slug, 'click/');

      const message =`${d.kind === 'media' ? d.domain && d.domain.indexOf('youtube') > -1 ? '📺' : '🎙' : '📰'} ${d.title}\n\nvia <a href="${d.url}">${d.source.title}</a>`;

      // add message
      telegramData.push(message);

      // add feed
      feedsData.push({ id: `${dynamodb_feeds_type}_${d.id}`, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(d) });
    });

    // save latest news id to aws s3
    if (newsData[0] && newsData[0].id) {
    	await new Promise(resolve => s3.putObject({
        Bucket: aws_s3_bucket,
        Key: aws_s3_bucket_key,
        Body: newsData[0].id.toString(),
        ACL: 'private'
      }, (err, data) => resolve(data && data.Body ? data.Body.toString() : null)));
    }
  }

  // post data to social poster
  if (telegramData.length > 0) {
    try {
      await axios.post(poster_api_host, { telegram: telegramData })
        .catch(error => error);
    } catch (error) {}
  }

  // save feeds data to dynamodb
  if (feedsData.length > 0) {
    for (let i = 0; i < feedsData.length; i++) {
      const feedData = feedsData[i];

      try {
        await axios.post(
          dynamodb_api_host, {
            table_name: dynamodb_table_name,
            method: 'put',
            ...feedData,
          }
        ).catch(error => error);
      } catch (error) {}
    }
  }

  // return data
  return {
    telegram: {
      data: telegramData,
    },
    feeds: {
      data: feedsData,
    },
  };
};