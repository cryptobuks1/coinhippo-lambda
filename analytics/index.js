/************************************************
 * This code is a function for analyze markets from coingecko API to post on social and provide on dashboard.
 * Deploy on AWS Lambda (triggered by AWS API Gateway & AWS EventBridge)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // import modules
  const _ = require('lodash');
  const numeral = require('numeral');
  const moment = require('moment');

  // function for remove decimals end with 000...
  const numberOptimizeDecimal = number => {
    if (typeof number === 'number') {
      number = number.toString();
    }
    if (number.includes('NaN')) {
      return number.replace('NaN', '<0.00000001');
    }
    if (typeof number === 'string') {
      if (number.indexOf('.') > -1) {
        let decimal = number.substring(number.indexOf('.') + 1);
        while (decimal.endsWith('0')) {
          decimal = decimal.substring(0, decimal.length - 1);
        }
        if (number.substring(0, number.indexOf('.')).length >= 7 && decimal.length > 2 && !isNaN(`0.${decimal}`)) {
          decimal = Number(`0.${decimal}`).toFixed(2).toString();
          if (decimal.indexOf('.') > -1) {
            decimal = decimal.substring(decimal.indexOf('.') + 1);
            while (decimal.endsWith('0')) {
              decimal = decimal.substring(0, decimal.length - 1);
            }
          }
        }
        return `${number.substring(0, number.indexOf('.'))}${decimal ? '.' : ''}${decimal}`;
      }
      return number;
    }
    return '';
  };

  // output data
  const telegramData = [];
  let twitterData = [];
  let feedsData = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const poster_api_host = process.env.POSTER_API_HOST || '{YOUR_POSTER_API_HOST}';
  const dynamodb_api_host = process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}';
  const dynamodb_table_name = process.env.DYNAMODB_TABLE_NAME || 'coinhippo-feeds';
  const dynamodb_feeds_type = 'signal';
  const website_url = process.env.WEBSITE_URL || 'https://coinhippo.io';
  const vs_currency = 'usd';
  const currency_symbol = '$';
  const times = ['1h','24h','7d','30d'];
  const filter_out_ids = ['wrapped-bitcoin','tether','usd-coin','binance-usd','dai','terrausd','true-usd'];

  // initial requester object
  const requester = axios.create({ baseURL: api_host, timeout: 30 * 1000 });

  // function to request data from coingecko API on AWS by passing 2 arguments (path, params)
  const request = async (path, params) => {
    // response data variable
    let response = null;

    try {
      // send request to your API
      const res = await requester.get('', { params: { api_name: 'coingecko', path, ...(params || {}) } })
        // set response data from error handled by exception
        .catch(error => { return { data: { error } }; });

      // set response data
      if (res && res.data) {
        response = res.data;
      }
    } catch (error) {
      // set response data from error handled by exception
      response = { error };
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

  // get route
  const route = event.queryStringParameters && event.queryStringParameters.path;

  // request coins
  path = '/coins/markets';
  params = { vs_currency, order: 'market_cap_desc', per_page: route === '/markets/status' ? 5 : 50, price_change_percentage: times.join(',') };
  response = await request(path, params);
  const coinsData = (response && !response.error && response.filter(c => filter_out_ids.indexOf(c.id) < 0)) || [];

  for (let i = 0; i < coinsData.length; i++) {
    const coinData = coinsData[i];

    path = `/coins/${coinData.id}/market_chart`;
    params = { id: coinData.id, vs_currency };

    params.days = 120;
    response = await request(path, params);

    if (response.prices) {
      ['week', 'month'].forEach(granularity => {
        coinData[`${granularity}s`] = _.orderBy(
          Object.entries(_.groupBy(response.prices.map(_price => {
            return {
              time: _price[0],
              value: _price[1],
              [`${granularity}`]: moment(_price[0]).startOf(granularity).valueOf(),
            };
          }), granularity)).map(([key, value]) => {
            return {
              [`${granularity}`]: key,
              open: _.minBy(value, 'time').value,
              low: _.minBy(value, 'value').value,
              high: _.maxBy(value, 'value').value,
              close: _.maxBy(value, 'time').value,
            };
          }),
        [granularity], ['asc']);
      });
    }

    params.days = 30;
    response = await request(path, params);

    if (response.prices) {
      ['day'].forEach(granularity => {
        coinData[`${granularity}s`] = _.orderBy(
          Object.entries(_.groupBy(response.prices.map(_price => {
            return {
              time: _price[0],
              value: _price[1],
              [`${granularity}`]: moment(_price[0]).startOf(granularity).valueOf(),
            };
          }), granularity)).map(([key, value]) => {
            return {
              [`${granularity}`]: key,
              open: _.minBy(value, 'time').value,
              low: _.minBy(value, 'value').value,
              high: _.maxBy(value, 'value').value,
              close: _.maxBy(value, 'time').value,
            };
          }),
        [granularity], ['asc']);
      });
    }

    coinsData[i] = coinData;
  }

  if (route === '/markets/status') {
    let status, text, html;

    if (coinsData) {
      if (_.mean(coinsData.map((coinData, i) => _.takeRight(coinData.months, 3).filter((priceData, j) => priceData.close < priceData.open && (j < 1 || priceData.close < _.takeRight(coinData.months, 3)[0].low)).length / (i + 1))) >= coinsData.length / 2) {
        status = 'bear';
        text = 'Bear Market';
        html = `<span class="font-bold">${text}</span>`;
      }
      else if (_.mean(coinsData.map((coinData, i) => _.takeRight(coinData.weeks, 5).filter((priceData, j) => priceData.close < priceData.open && (j < 1 || priceData.close < _.takeRight(coinData.weeks, 5)[0].low)).length / (i + 1))) >= coinsData.length / 2) {
        status = 'bear_starting';
        text = 'Starting of Bearish';
        html = '<span class="h-5 flex flex-wrap items-center font-normal space-x-1"><span>Starting of</span><span class="font-bold">Bearish</span></span>';
      }
      else if (_.mean(coinsData.map((coinData, i) => _.takeRight(coinData.weeks, 3).filter((priceData, j) => priceData.close < priceData.open && (j < 1 || priceData.close < _.takeRight(coinData.weeks, 3)[0].low)).length / (i + 1))) >= coinsData.length / 2) {
        status = 'likely_bear';
        text = 'smells like Bear Market';
        html = '<span class="h-5 flex flex-wrap items-center font-normal space-x-1"><span>smells like</span><span class="font-bold">Bear Market</span></span>';
      }
      else if (_.mean(coinsData.map((coinData, i) => _.takeRight(coinData.months, 3).filter((priceData, j) => priceData.close > priceData.open && (j < 1 || priceData.close > _.takeRight(coinData.months, 3)[0].high)).length / (i + 1))) >= coinsData.length / 2) {
        status = 'bull';
        text = 'Bull Market';
        html = `<span class="font-bold">${text}</span>`;
      }
      else if (_.mean(coinsData.map((coinData, i) => _.takeRight(coinData.weeks, 5).filter((priceData, j) => priceData.close > priceData.open && (j < 1 || priceData.close > _.takeRight(coinData.weeks, 5)[0].high)).length / (i + 1))) >= coinsData.length / 2) {
        status = 'bull_starting';
        text = 'Starting of Bullish';
        html = '<span class="h-5 flex flex-wrap items-center font-normal space-x-1"><span>Starting of</span><span class="font-bold">Bullish</span></span>';
      }
      else if (_.mean(coinsData.map((coinData, i) => _.takeRight(coinData.weeks, 3).filter((priceData, j) => priceData.close > priceData.open && (j < 1 || priceData.close > _.takeRight(coinData.weeks, 3)[0].high)).length / (i + 1))) >= coinsData.length / 2) {
        status = 'likely_bull';
        text = 'smells like Bull Market';
        html = '<span class="h-5 flex flex-wrap items-center font-normal space-x-1"><span>smells like</span><span class="font-bold">Bull Market</span></span>';
      }
      else {
        status = 'sideway';
        text = 'Sideways';
        html = `<span class="font-bold">${text}</span>`;
      }
    }

    // return data
    return {
      data: {
        status,
        text,
        html,
      }
    };
  }
  else {
    const isRunTwitter = Number(moment().minutes()) === 0 && Number(moment().hours()) % 2 === 1;

    let id;

    // if (coinsData && coinsData.length > 0) {
    //   let message = '';
    //   const data = _.slice(coinsData.filter(c => c.price_change_percentage_24h_in_currency_abs >= 5), 0, 3);

    //   data.forEach((c, i) => {
    //     // title
    //     message += `${i === 0 ? `<a href="${website_url}/coins">🌪 Signal</a>` : ''}\n`;

    //     // coin message
    //     message += `<a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : c.name}</a> <b>${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}</b> <pre>${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</pre>`;
    //   });

    //   id = `${dynamodb_feeds_type}_${moment().unix()}`;

    //   // add message
    //   if (message) {
    //     telegramData.push(message);

    //     // add feed
    //     feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(data) });
    //   }
    // }

    // if (isRunTwitter && coinsData && coinsData.length > 0) {
    //   let message = '';
    //   const data = _.slice(coinsData.filter(c => c.price_change_percentage_24h_in_currency_abs >= 5), 0, 3);
    //   data.forEach((c, i) => {
    //     // title
    //     message += `${i === 0 ? `Let's check on the top${data.length > 1 ? ` ${data.length}` : ''} % changes 🌊` : ''}\n`;

    //     // coin message
    //     message += `${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name} ${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))} ${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}`;
    //   });

    //   // coins url
    //   message += data.length === 1 ? data.map(c => `\n${website_url}/coin/${c.id}`) : `\n${website_url}/coins`;

    //   // add hashtag
    //   message += `\n\n💙 if you HODL any one of them\n\n${data.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} `;

    //   // add message
    //   if (message) {
    //     twitterData.push({ id, text: message, data });
    //   }
    // }

    // normalize twitter data for social poster
    if (twitterData && twitterData.length > 0) {
      twitterData = twitterData.map(_twitterData => {
        return {
          ..._twitterData,
          // add hashtag
          text: `${_twitterData.text}${_twitterData.text.endsWith(' ') ? `#Crypto #Cryptocurrency` : ''}`,
        };
      });
    }

    // save feeds data to dynamodb
    if (feedsData.length > 0) {
      feedsData = _.reverse(feedsData);
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
  }
};