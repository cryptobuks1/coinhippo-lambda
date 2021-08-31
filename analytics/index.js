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

  const capitalize = s => typeof s !== 'string' ? '' : s.trim().split(' ').join('_').split('-').join('_').split('_').map(x => x.trim()).filter(x => x).map(x => `${x.substr(0, 1).toUpperCase()}${x.substr(1)}`).join(' ');

  const getGranularityTitle = granularity => {
    const titles = {
      day: 'Daily',
      week: 'Weekly',
      month: 'Monthly',
    };
    return titles[granularity] || capitalize(granularity);
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
  const ath_change_threshold = Number(process.env.ATH_CHANGE_THRESHOLD) || -90;
  const min_candle_change_percentage = Number(process.env.MIN_CANDLE_CHANGE_PERCENTAGE) || 0.1;
  const candle_threshold = Number(process.env.CANDLE_THRESHOLD) || 0.1;
  const doji_threshold = Number(process.env.DOJI_THRESHOLD) || 0.01;
  const hammer_threshold = Number(process.env.HAMMER_THRESHOLD) || 0.2;
  const ma_threshold = Number(process.env.MA_THRESHOLD) || 0.03;
  const vs_currency = 'usd';
  const currency_symbol = '$';
  const times = ['1h','24h','7d','30d'];
  const filter_out_ids = ['wrapped-bitcoin','tether','usd-coin','binance-usd','dai','terrausd','true-usd','compound-ether','compound-usd-coin','cdai','bitcoin-cash','bitcoin-cash-sv','bitcoin-cash-abc-2','bitcoin-gold','staked-ether','huobi-btc','paxos-standard'];

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

  // get current minute
  const minute = Number(moment().minutes());

  // request coins
  path = '/coins/markets';
  params = { vs_currency, order: 'market_cap_desc', per_page: route === '/markets/status' ? 5 : 100, price_change_percentage: times.join(',') };
  response = await request(path, params);
  const coinsDataForStatus = (response && !response.error && _.slice(response, 0, 5)) || [];
  let coinsData = (response && !response.error && response.filter(c => filter_out_ids.indexOf(c.id) < 0)) || [];

  // setup chart data for analyze
  const daysWithGranularities = [
    {
      days: 120,
      granularities: ['week', 'month'],
    },
    {
      days: 30,
      granularities: ['day'],
    },
  ];

  const daysWithGranularitiesForMA = [
    {
      days: 200,
      granularities: ['day'],
    },
  ];

  const maList = [200, 100, 50, 20];

  for (let i = 0; i < coinsData.length; i++) {
    const coinData = coinsData[i];

    path = `/coins/${coinData.id}/market_chart`;
    params = { id: coinData.id, vs_currency };

    for (let j = 0; j < daysWithGranularities.length; j++) {
      params.days = daysWithGranularities[j].days;
      response = await request(path, params);

      if (response.prices) {
        daysWithGranularities[j].granularities.forEach(granularity => {
          const pricesGranularityData = _.orderBy(
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

          coinData.ohlc = { ...coinData.ohlc, [`${granularity}s`]: pricesGranularityData };
        });
      }

      if (response.total_volumes) {
        daysWithGranularities[j].granularities.forEach(granularity => {
          const volumesGranularityData = _.orderBy(
            Object.entries(_.groupBy(response.total_volumes.map(_volume => {
              return {
                time: _volume[0],
                value: _volume[1],
                [`${granularity}`]: moment(_volume[0]).startOf(granularity).valueOf(),
              };
            }), granularity)).map(([key, value]) => {
              return {
                [`${granularity}`]: key,
                value: _.sumBy(value, 'value'),
              };
            }),
          [granularity], ['asc']);

          coinData.volumes = { ...coinData.volumes, [`${granularity}s`]: volumesGranularityData };
        });
      }
    }

    for (let j = 0; j < daysWithGranularitiesForMA.length; j++) {
      params.days = daysWithGranularitiesForMA[j].days;
      response = await request(path, params);

      if (response.prices) {
        daysWithGranularitiesForMA[j].granularities.forEach(granularity => {
          const pricesGranularityData = _.orderBy(
            Object.entries(_.groupBy(response.prices.map(_price => {
              return {
                time: _price[0],
                value: _price[1],
                [`${granularity}`]: moment(_price[0]).startOf(granularity).valueOf(),
              };
            }), granularity)).map(([key, value]) => {
              return {
                [`${granularity}`]: key,
                value: _.last(value).value,
              };
            }),
          [granularity], ['asc']);

          coinData.prices = { ...coinData.prices, [`${granularity}s`]: { ...(coinData.prices && coinData.prices[`${granularity}s`]), [`${daysWithGranularitiesForMA[j].days}`]: pricesGranularityData } };
        });
      }
    }

    coinsData[i] = coinData;
  }

  // calculate market status
  let marketStatus;
  let coinsDataStatus;

  if (coinsData) {
    coinsData = coinsData.filter(coinData => coinData.ohlc && coinData.volumes && coinData.prices);

    coinsDataStatus = _.orderBy(coinsData.filter(coinData => coinsDataForStatus.findIndex(_coinData => _coinData.id === coinData.id) > -1), ['market_cap_rank'], ['asc']);

    if (_.mean(coinsDataStatus.map((coinData, i) => _.takeRight(coinData.ohlc.months, 3).filter((priceData, j) => priceData.close < priceData.open && Math.abs((priceData.close / priceData.low) - 1) <= candle_threshold && Math.abs((priceData.open / priceData.high) - 1) <= candle_threshold && (j < 1 || priceData.close < _.takeRight(coinData.ohlc.months, 3)[0].low)).length / (i + 1))) >= coinsDataStatus.length / 2) {
      marketStatus = 'bear';
    }
    else if (_.mean(coinsDataStatus.map((coinData, i) => _.takeRight(coinData.ohlc.weeks, 5).filter((priceData, j) => priceData.close < priceData.open && Math.abs((priceData.close / priceData.low) - 1) <= candle_threshold && Math.abs((priceData.open / priceData.high) - 1) <= candle_threshold && (j < 1 || priceData.close < _.takeRight(coinData.ohlc.weeks, 5)[0].low)).length / (i + 1))) >= coinsDataStatus.length / 2) {
      marketStatus = 'bear_starting';
    }
    else if (_.mean(coinsDataStatus.map((coinData, i) => _.takeRight(coinData.ohlc.weeks, 3).filter((priceData, j) => priceData.close < priceData.open && Math.abs((priceData.close / priceData.low) - 1) <= candle_threshold && Math.abs((priceData.open / priceData.high) - 1) <= candle_threshold && (j < 1 || priceData.close < _.takeRight(coinData.ohlc.weeks, 3)[0].low)).length / (i + 1))) >= coinsDataStatus.length / 2) {
      marketStatus = 'likely_bear';
    }
    else if (_.mean(coinsDataStatus.map((coinData, i) => _.takeRight(coinData.ohlc.months, 3).filter((priceData, j) => priceData.close > priceData.open && Math.abs((priceData.close / priceData.high) - 1) <= candle_threshold && Math.abs((priceData.open / priceData.low) - 1) <= candle_threshold && (j < 1 || priceData.close > _.takeRight(coinData.ohlc.months, 3)[0].high)).length / (i + 1))) >= coinsDataStatus.length / 2) {
      marketStatus = 'bull';
     }
    else if (_.mean(coinsDataStatus.map((coinData, i) => _.takeRight(coinData.ohlc.weeks, 5).filter((priceData, j) => priceData.close > priceData.open && Math.abs((priceData.close / priceData.high) - 1) <= candle_threshold && Math.abs((priceData.open / priceData.low) - 1) <= candle_threshold && (j < 1 || priceData.close > _.takeRight(coinData.ohlc.weeks, 5)[0].high)).length / (i + 1))) >= coinsDataStatus.length / 2) {
      marketStatus = 'bull_starting';
    }
    else if (_.mean(coinsDataStatus.map((coinData, i) => _.takeRight(coinData.ohlc.weeks, 3).filter((priceData, j) => priceData.close > priceData.open && Math.abs((priceData.close / priceData.high) - 1) <= candle_threshold && Math.abs((priceData.open / priceData.low) - 1) <= candle_threshold && (j < 1 || priceData.close > _.takeRight(coinData.ohlc.weeks, 3)[0].high)).length / (i + 1))) >= coinsDataStatus.length / 2) {
      marketStatus = 'likely_bull';
    }
    else {
      marketStatus = 'sideway';
    }
  }

  if (route === '/markets/status') {
    const status = marketStatus;
    let text, html;

    if (status) {
      if (status === 'bear') {
        text = 'Bear Market';
        html = `<span class="font-bold">${text}</span>`;
      }
      else if (status === 'bear_starting') {
        text = 'Starting of Bearish';
        html = '<span class="h-5 flex flex-wrap items-center font-normal space-x-1"><span>Starting of</span><span class="font-bold">Bearish</span></span>';
      }
      else if (status === 'likely_bear') {
        text = 'smells like Bear Market';
        html = '<span class="h-5 flex flex-wrap items-center font-normal space-x-1"><span>smells like</span><span class="font-bold">Bear Market</span></span>';
      }
      else if (status === 'bull') {
        text = 'Bull Market';
        html = `<span class="font-bold">${text}</span>`;
      }
      else if (status === 'bull_starting') {
        text = 'Starting of Bullish';
        html = '<span class="h-5 flex flex-wrap items-center font-normal space-x-1"><span>Starting of</span><span class="font-bold">Bullish</span></span>';
      }
      else if (status === 'likely_bull') {
        text = 'smells like Bull Market';
        html = '<span class="h-5 flex flex-wrap items-center font-normal space-x-1"><span>smells like</span><span class="font-bold">Bull Market</span></span>';
      }
      else {
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
  // calculate trade signal
  else {
    if (coinsData && coinsData.length > 0) {
      coinsData = coinsData.map(c => {
        const buy_signals = [];
        const sell_signals = [];

        if (typeof c.ath_change_percentage === 'number' && c.ath_change_percentage <= ath_change_threshold) {
          buy_signals.push({
            criteria: 'ath_change',
            text: `${numeral(c.ath_change_percentage / 100).format('+0,0.00%')} from ATH`,
            value: c.ath_change_percentage,
          });
        }

        if (c.ohlc) {
          if (_.slice(_.takeRight(c.ohlc.weeks, 4), 0, 3).filter((priceData, i) => priceData.close > priceData.open && Math.abs((priceData.close / priceData.high) - 1) <= candle_threshold && Math.abs((priceData.open / priceData.low) - 1) <= candle_threshold && (i < 1 || priceData.close > _.slice(_.takeRight(c.ohlc.weeks, 4), 0, 3)[0].high)).length > 2) {
            buy_signals.push({
              criteria: 'three_white_soldiers',
              text: 'Three White Soldiers',
              value: _.slice(_.takeRight(c.ohlc.weeks, 4), 0, 3),
            });
          }
          else if (_.slice(_.takeRight(c.ohlc.weeks, 4), 0, 3).filter((priceData, i) => priceData.close < priceData.open &&Math.abs((priceData.close / priceData.low) - 1) <= candle_threshold && Math.abs((priceData.open / priceData.high) - 1) <= candle_threshold && (i < 1 || priceData.close < _.slice(_.takeRight(c.ohlc.weeks, 4), 0, 3)[0].low)).length > 2) {
            sell_signals.push({
              criteria: 'three_black_crows',
              text: 'Three Black Crows',
              value: _.slice(_.takeRight(c.ohlc.weeks, 4), 0, 3),
            });
          }
        }

        if (c.prices && c.prices.days && c.prices.days['200'] && c.prices.days['200'].length > 0) {
          const pricesData = c.prices.days['200'];
          const pricesOrder = _.orderBy(_.chunk(_.slice(pricesData, 100), 20).map((chunk, i) => { return { value: _.meanBy(chunk, 'value'), i } }), ['value'], ['desc']).map(chunk => chunk.i).join('');

          if (marketStatus === 'likely_bull') {
            if (pricesOrder.startsWith('042')) {
              buy_signals.push({
                criteria: 'trend_reform',
                pattern: 'double_bottom',
                text: 'Double Bottom',
                value: _.slice(pricesData, 100),
              });
            }
            else if (pricesOrder.startsWith('04') && pricesOrder.endsWith('2')) {
              buy_signals.push({
                criteria: 'trend_reform',
                pattern: 'inverted_head_&_shoulders',
                text: 'Inverted Head & Shoulders',
                value: _.slice(pricesData, 100),
              });
            }
          }
          else if (marketStatus === 'likely_bear') {
            if (pricesOrder.endsWith('240')) {
              sell_signals.push({
                criteria: 'trend_reform',
                pattern: 'double_top',
                text: 'Double Top',
                value: _.slice(pricesData, 100),
              });
            }
            else if (pricesOrder.startsWith('2') && pricesOrder.endsWith('40')) {
              sell_signals.push({
                criteria: 'trend_reform',
                pattern: 'head_&_shoulders',
                text: 'Head & Shoulders',
                value: _.slice(pricesData, 100),
              });
            }
          }

          maList.forEach(ma => {
            if (Math.abs((c.current_price / _.meanBy(_.takeRight(pricesData, ma), 'value')) - 1) <= ma_threshold) {
              buy_signals.push({
                criteria: `ma${ma}`,
                text: `MA${ma}`,
                value: _.meanBy(_.takeRight(pricesData, ma), 'value'),
              });
            }
          });
        }

        ['day', 'week', 'month'].forEach(granularity => {
          const { ohlc, volumes } = { ...c };
          const ohlcData = ohlc && ohlc[`${granularity}s`] && ohlc[`${granularity}s`].length > 0 && ohlc[`${granularity}s`];
          const volumesData = volumes && volumes[`${granularity}s`] && volumes[`${granularity}s`].length > 0 && volumes[`${granularity}s`];

          if (ohlcData) {
            const { open, high, low, close } = _.last(ohlcData);

            if (Math.abs(high - low) / _.mean([high, low]) >= min_candle_change_percentage) {
              if (_.slice(_.takeRight(ohlcData, 4), 0, 3).filter((priceData, i) => priceData.close > priceData.open && (i < 1 || priceData.close > _.slice(_.takeRight(ohlcData, 4), 0, 3)[0].high)).length > 2) {
                let reformPattern;

                if (Math.abs((open / close) - 1) <= doji_threshold && Math.abs((_.mean([open, close]) / _.mean([high, low])) - 1) <= doji_threshold) {
                  reformPattern = 'doji';
                }
                else if (doji_threshold <= Math.abs(close - open) / Math.abs(high - low) && Math.abs(close - open) / Math.abs(high - low) <= hammer_threshold && (Math.abs((close / low) - 1) <= doji_threshold || Math.abs((open / low) - 1) <= doji_threshold)) {
                  reformPattern = 'hammer';
                }

                if (reformPattern) {
                  sell_signals.push({
                    criteria: `${granularity}_reform`,
                    pattern: reformPattern,
                    text: `${getGranularityTitle(granularity)} ${capitalize(reformPattern)}`,
                    value: _.takeRight(ohlcData, 4),
                  });
                }
              }
              else if (_.slice(_.takeRight(ohlcData, 4), 0, 3).filter((priceData, i) => priceData.close < priceData.open && (i < 1 || priceData.close < _.slice(_.takeRight(ohlcData, 4), 0, 3)[0].low)).length > 2) {
                let reformPattern;

                if (Math.abs((open / close) - 1) <= doji_threshold && Math.abs((_.mean([open, close]) / _.mean([high, low])) - 1) <= doji_threshold) {
                  reformPattern = 'doji';
                }
                else if (doji_threshold <= Math.abs(close - open) / Math.abs(high - low) && Math.abs(close - open) / Math.abs(high - low) <= hammer_threshold && (Math.abs((close / high) - 1) <= doji_threshold || Math.abs((open / high) - 1) <= doji_threshold)) {
                  reformPattern = 'hammer';
                }

                if (reformPattern) {
                  buy_signals.push({
                    criteria: `${granularity}_reform`,
                    pattern: reformPattern,
                    text: `${getGranularityTitle(granularity)} ${capitalize(reformPattern)}`,
                    value: _.takeRight(ohlcData, 4),
                  });
                }
              }
            }

            if (volumesData) {
              if (_.last(volumesData)[granularity] === _.maxBy(volumesData, 'value')[granularity]) {
                if (close > open) {
                  buy_signals.push({
                    criteria: `${granularity}_big_lot`,
                    text: `${getGranularityTitle(granularity)} Big Lot`,
                    value: _.last(volumesData),
                  });
                }
                else if (open > close) {
                  sell_signals.push({
                    criteria: `${granularity}_big_lot`,
                    text: `${getGranularityTitle(granularity)} Big Lot`,
                    value: _.last(volumesData),
                  });
                }
              }
            }
          }
        });

        c = {
          ...c,
          signal: {
            buy: buy_signals,
            sell: sell_signals,
            action: buy_signals.length > sell_signals.length ? 'buy' : sell_signals.length > buy_signals.length ? 'sell' : null,
            size: buy_signals.length > sell_signals.length ? buy_signals.length : sell_signals.length > buy_signals.length ? sell_signals.length : null,
            strategy: !marketStatus ? null :
              marketStatus.includes('bull') ? buy_signals.length > sell_signals.length ? 'buy_on_dips' : 'hodl' :
              marketStatus.includes('bear') ? buy_signals.length > sell_signals.length ? 'wait_&_see' : 'hold_stablecoin' :
              marketStatus.includes('sideway') ? buy_signals.length > sell_signals.length ? 'short_term' : 'take_profit' :
              null,
          }
        };

        return c;
      }).filter(c => c.signal && c.signal.action &&
        c.signal[c.signal.action].findIndex(signal => signal.criteria === 'day_reform' || maList.findIndex(ma => signal.criteria === `ma${ma}`) > -1) > -1 &&
        (c.signal[c.signal.action].length > 1 || c.signal[c.signal.action].findIndex(signal => maList.filter(ma => ma < 100).findIndex(ma => signal.criteria === `ma${ma}`) > -1) < 0)
      );
    }

    const isRunTwitter = minute % 20 === 0;

    let id;

    if (coinsData && coinsData.length > 0) {
      let message = '';
      let data = (_.slice(_.chunk(_.orderBy(coinsData, ['signal.size'], ['desc']), Math.ceil(coinsData.length / 3))[Math.floor(minute / 20)], 0, 5)) || [];

      data.forEach((c, i) => {
        // title
        message += `${i === 0 ? `<a href="${website_url}/coins">🤔 Trade Signal</a>` : ''}\n`;

        // coin message
        message += `<b>${c.signal.action.toUpperCase()}</b> <a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : c.name}</a> <b>${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}</b> <pre>${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</pre>`;
        message += `\nStrategy: <pre>${capitalize(c.signal.strategy).toUpperCase()}</pre>`;
        message += `\nCriteria: <pre>${c.signal[c.signal.action].map(signal => signal.text).join(', ')}</pre>\n`;
      });

      id = `${dynamodb_feeds_type}_${moment().unix()}`;

      // add message
      if (message) {
        telegramData.push(message);

        data = _.slice(data, 0, 3);
        // add feed
        feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(data) });
      }

      if (isRunTwitter && data.length > 0) {
        message = '';
        data.forEach((c, i) => {
          // title
          message += `${i === 0 ? 'Technical Suggestion' : ''}\n`;

          // coin message
          message += `${c.signal.action.toUpperCase()} ${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name} ${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))} ${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}`;
        });

        // coins url
        message += data.length === 1 ? data.map(c => `\n${website_url}/coin/${c.id}`) : `\n${website_url}/coins`;

        // add hashtag
        message += `\n\n⭐ Not Financial Advice\n\n${data.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} #CoinHippo `;

        // add message
        if (message) {
          twitterData.push({ id, text: message, data });
        }
      }
    }

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