/************************************************
 * This code is a function for calculate feeds data from coingecko API to show on dashboard feeds.
 * Deploy on AWS Lambda (triggered by AWS API Gateway)
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
    if (number === 'NaN') {
      return '<0.00000001';
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

  // response data
  const data = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const website_url = process.env.WEBSITE_URL || 'https://coinhippo.io';
  const vs_currency = 'usd';
  const currency_symbol = '$';
  const times = ['1h','24h','7d','30d'];
  const filter_out_ids = ['wrapped-bitcoin','tether','usd-coin','binance-usd','dai'];

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

  // request coins
  path = '/coins/markets';
  params = { vs_currency, order: 'market_cap_desc', per_page: 50, price_change_percentage: times.join(',') };
  response = await request(path, params);
  const marketCapData = response && !response.error && response.filter(c => filter_out_ids.indexOf(c.id) < 0);

  // request defi
  params = { ...params, category: 'decentralized-finance-defi' };
  response = await request(path, params);
  const defiData = response && !response.error && response.filter(c => filter_out_ids.indexOf(c.id) < 0);

  // request nfts
  params = { ...params, category: 'non-fungible-tokens-nft' };
  response = await request(path, params);
  const nftsData = response && !response.error && response.filter(c => filter_out_ids.indexOf(c.id) < 0);

  // request trending
  path = '/search/trending';
  params = null;
  let trendingData = response && response.coins && response.coins.filter(c => filter_out_ids.indexOf(c.id) < 0);
  if (trendingData && trendingData.length > 0) {
  	path = '/coins/markets';
  	params = { vs_currency, ids: trendingData.map(c => c.item && c.item.id).join(','), price_change_percentage: times.join(',') };
    response = await request(path, params);
    const trendingCoinsData = response;
    if (trendingCoinsData && trendingCoinsData.length > 0) {
      trendingData = trendingData.map((d, i) => {
        d = { ...d.item, image: d.thumb, rank: i };
        const coinIndex = d.id && trendingCoinsData ? trendingCoinsData.findIndex(c => c.id === d.id) : -1;
        if (coinIndex > -1) {
          d = { ...d, ...trendingCoinsData[coinIndex] };
        }
        return d;
      });
    }
  }

  // sorted data
  const marketCapDataSorted = marketCapData && _.orderBy(marketCapData.map(c => { times.forEach(t => c[`price_change_percentage_${t}_in_currency_abs`] = Math.abs(c[`price_change_percentage_${t}_in_currency`])); return c; }), ['price_change_percentage_24h_in_currency_abs', 'price_change_percentage_1h_in_currency_abs'], ['desc', 'desc']);
  const defiDataSorted = defiData && _.orderBy(defiData.map(c => { times.forEach(t => c[`price_change_percentage_${t}_in_currency_abs`] = Math.abs(c[`price_change_percentage_${t}_in_currency`])); return c; }), ['market_cap_rank', 'price_change_percentage_24h_in_currency_abs', 'price_change_percentage_1h_in_currency_abs'], ['asc', 'desc', 'desc']);
  const nftsDataSorted = nftsData && _.orderBy(nftsData.map(c => { times.forEach(t => c[`price_change_percentage_${t}_in_currency_abs`] = Math.abs(c[`price_change_percentage_${t}_in_currency`])); return c; }), ['market_cap_rank', 'price_change_percentage_24h_in_currency_abs', 'price_change_percentage_1h_in_currency_abs'], ['asc', 'desc', 'desc']);
  const trendingDataSorted = trendingData && trendingData.findIndex(c => typeof c.current_price === 'number') > -1 && _.orderBy(trendingData.map(c => { times.forEach(t => c[`price_change_percentage_${t}_in_currency_abs`] = Math.abs(c[`price_change_percentage_${t}_in_currency`])); return c; }), ['rank', 'price_change_percentage_24h_in_currency_abs', 'price_change_percentage_1h_in_currency_abs'], ['asc', 'desc', 'desc']);

  // all time data
  const allTimeHighData = marketCapDataSorted && marketCapDataSorted.filter(c => moment().diff(moment(c.ath_date), 'hours', true) <= 1);
  const allTimeLowData = marketCapDataSorted && marketCapDataSorted.filter(c => moment().diff(moment(c.atl_date), 'hours', true) <= 1);

  const subData = [];
  let hasAllTime = false;

  if (allTimeHighData && allTimeHighData.length > 0) {
    hasAllTime = true;
    _.slice(allTimeHighData, 0, 3).forEach((c, i) => {
      const highPrice = _.max([c.ath, c.current_price, c.high_24h].filter(x => typeof x === 'number'));
      subData.push(`<span class="f-22">🔥</span>&nbsp;<span class="f-w-500" style="min-width:fit-content;">ALL TIME HIGH</span><div class="w-100 mt-1"></div><a href="${website_url}/coin/${c.id}" class="d-flex align-items-center" style="min-width:fit-content;"><img src="${c.image}" alt="${c.symbol}" style="width:1.5rem;" />&nbsp;${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>&nbsp;${c.name}&nbsp;&nbsp;${currency_symbol}${numberOptimizeDecimal(numeral(highPrice).format(`0,0${highPrice >= 100 ? '' : highPrice >= 1 ? '.00' : '.00000000'}`))}`);
    });
  }

  if (allTimeLowData && allTimeLowData.length > 0) {
    hasAllTime = true;
    _.slice(allTimeLowData, 0, 3).forEach((c, i) => {
      const lowPrice = _.min([c.atl, c.current_price, c.low_24h].filter(x => typeof x === 'number'));
      subData.push(`<span class="f-22">‼️</span>&nbsp;<span class="f-w-500" style="min-width:fit-content;">ALL TIME LOW</span><div class="w-100 mt-1"></div><a href="${website_url}/coin/${c.id}" class="d-flex align-items-center" style="min-width:fit-content;"><img src="${c.image}" alt="${c.symbol}" style="width:1.5rem;" />&nbsp;${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>&nbsp;${c.name}&nbsp;&nbsp;${currency_symbol}${numberOptimizeDecimal(numeral(lowPrice).format(`0,0${lowPrice >= 100 ? '' : lowPrice >= 1 ? '.00' : '.00000000'}`))}`);
    });
  }

  if (!hasAllTime) {
    if (marketCapDataSorted && marketCapDataSorted.length > 0) {
      _.slice(marketCapDataSorted.filter(c => c.price_change_percentage_24h_in_currency_abs >= 5), 0, 3).forEach((c, i) => {
        subData.push(`<span class="f-22">🧐</span>&nbsp;<span class="f-w-500" style="min-width:fit-content;">High Market Cap</span><div class="w-100 mt-1"></div><a href="${website_url}/coin/${c.id}" class="d-flex align-items-center" style="min-width:fit-content;"><img src="${c.image}" alt="${c.symbol}" style="width:1.5rem;" />&nbsp;${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>&nbsp;${c.name}&nbsp;&nbsp;${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}&nbsp;<span class="${c.price_change_percentage_24h_in_currency > 0 ? 'font-success' : c.price_change_percentage_24h_in_currency < 0 ? 'font-danger' : ''}">${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</span>`);
      });
    }

    if (trendingDataSorted && trendingDataSorted.length > 0) {
      _.slice(trendingDataSorted, 0, 3).forEach((c, i) => {
        subData.push(`<span class="f-22">🤔</span>&nbsp;<span class="f-w-500" style="min-width:fit-content;">Trending Now</span><div class="w-100 mt-1"></div><a href="${website_url}/coin/${c.id}" class="d-flex align-items-center" style="min-width:fit-content;"><img src="${c.image}" alt="${c.symbol}" style="width:1.5rem;" />&nbsp;${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>&nbsp;${c.name}&nbsp;&nbsp;${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}&nbsp;<span class="${c.price_change_percentage_24h_in_currency > 0 ? 'font-success' : c.price_change_percentage_24h_in_currency < 0 ? 'font-danger' : ''}">${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</span>`);
      });
    }

    if (Number(moment().milliseconds()) % 2 === 0) {
      if (defiDataSorted && defiDataSorted.length > 0) {
        _.slice(defiDataSorted, 0, 3).forEach((c, i) => {
          subData.push(`<span class="f-22">🦄</span>&nbsp;<span class="f-w-500" style="min-width:fit-content;">Top DeFi</span><div class="w-100 mt-1"></div><a href="${website_url}/coin/${c.id}" class="d-flex align-items-center" style="min-width:fit-content;"><img src="${c.image}" alt="${c.symbol}" style="width:1.5rem;" />&nbsp;${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>&nbsp;${c.name}&nbsp;&nbsp;${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}&nbsp;<span class="${c.price_change_percentage_24h_in_currency > 0 ? 'font-success' : c.price_change_percentage_24h_in_currency < 0 ? 'font-danger' : ''}">${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</span>`);
        });
      }
    }
    else {
      if (nftsDataSorted && nftsDataSorted.length > 0) {
        _.slice(nftsDataSorted, 0, 3).forEach((c, i) => {
          subData.push(`<span class="f-22">🌠</span>&nbsp;<span class="f-w-500" style="min-width:fit-content;">Top NFTs</span><div class="w-100 mt-1"></div><a href="${website_url}/coin/${c.id}" class="d-flex align-items-center" style="min-width:fit-content;"><img src="${c.image}" alt="${c.symbol}" style="width:1.5rem;" />&nbsp;${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>&nbsp;${c.name}&nbsp;&nbsp;${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}&nbsp;<span class="${c.price_change_percentage_24h_in_currency > 0 ? 'font-success' : c.price_change_percentage_24h_in_currency < 0 ? 'font-danger' : ''}">${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</span>`);
        });
      }
    }
  }

  // market status data
  let marketStatus = '';

  if (marketCapData && marketCapData.length > 0) {
    const coinsData = _.slice(marketCapData, 0, 3).map(c => { c.x = c.price_change_percentage_1h_in_currency * c.market_cap; c.y = c.price_change_percentage_24h_in_currency * c.market_cap; return c; });
    const total = _.sumBy(coinsData, 'market_cap');

    if (total > 0) {
      const sumX = _.sumBy(coinsData, 'x');
      const sumY = _.sumBy(coinsData, 'y');
      const hourExceed = Math.abs(sumX / total) >= 5;
      const dayExceed = Math.abs(sumY / total) >= 10;

      if (hourExceed || dayExceed) {
        marketStatus = (hourExceed ? sumX : sumY) < 0 ? 'panic' : 'fomo';

        let message = '';
        coinsData.forEach((c, i) => {
          message += `${i === 0 ? `<span class="f-22">${marketStatus === 'panic' ? '😱' : '🤩'}</span>&nbsp;<span class="f-w-500" style="min-width:fit-content;">${marketStatus === 'panic' ? 'Panic Selling' : 'FOMO Buying'}</span><div class="w-100"></div>` : ''}`;
          message += `<div class="d-flex align-items-center mt-1"><a href="${website_url}/coin/${c.id}" class="d-flex align-items-center" style="min-width:fit-content;"><img src="${c.image}" alt="${c.symbol}" style="width:1.5rem;" />&nbsp;${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>&nbsp;${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}&nbsp;<span class="${c.price_change_percentage_24h_in_currency > 0 ? 'font-success' : c.price_change_percentage_24h_in_currency < 0 ? 'font-danger' : ''}">${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</span></div>`;
          message += `${i < coinsData.length - 1 ? '&nbsp;&nbsp;' : ''}`;
        });

        if (message) {
          data.push(message);
        }
      }
    }
  }

  if (!marketStatus && marketCapDataSorted.findIndex(c => c.id === 'bitcoin') > -1) {
    const c = marketCapDataSorted[marketCapDataSorted.findIndex(c => c.id === 'bitcoin')];
    data.push(`Today's&nbsp;<a href="${website_url}/coin/${c.id}" class="d-flex align-items-center" style="min-width:fit-content;"><img src="${c.image}" alt="${c.symbol}" style="width:1.5rem;" /></a>&nbsp;${c.name}&nbsp;(<a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>)&nbsp;price&nbsp;${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}&nbsp;<span class="${c.price_change_percentage_24h_in_currency > 0 ? 'font-success' : c.price_change_percentage_24h_in_currency < 0 ? 'font-danger' : ''}">${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</span>`);
  }

  // return response data
  return data.concat(subData).map(t => `<div class="d-flex align-items-center" style="line-height:1.5rem;flex-flow:wrap;">${t}</div>`);
};