/************************************************
 * This code is a function for calculate markets alert data from coingecko API to post on social.
 * Deploy on AWS Lambda (triggered by AWS EventBridge)
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
  let telegramData = [];
  let twitterData = [];
  let feedsData = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const poster_api_host = process.env.POSTER_API_HOST || '{YOUR_POSTER_API_HOST}';
  const dynamodb_api_host = process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}';
  const dynamodb_table_name = process.env.DYNAMODB_TABLE_NAME || 'coinhippo-feeds';
  const dynamodb_feeds_type = 'markets';
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
  response = await request(path, params);
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

  let hasAllTime = false;

  if (allTimeHighData && allTimeHighData.length > 0) {
    hasAllTime = true;

    let telegramMessage = '';
    let twitterMessage = '';

    const data = _.slice(allTimeHighData, 0, 3).map(c => { return { ...c, high_price: _.max([c.ath, c.current_price, c.high_24h].filter(x => typeof x === 'number')) }; });
    data.forEach((c, i) => {
      const highPrice = c.high_price;

      // title
      telegramMessage += `${i === 0 ? '🔥 ALL TIME HIGH' : ''}\n`;

      // coin message
      telegramMessage += `<a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a> <pre>${currency_symbol}${numberOptimizeDecimal(numeral(highPrice).format(`0,0${highPrice >= 100 ? '' : highPrice >= 1 ? '.00' : '.00000000'}`))}</pre>`;

      // coin message
      twitterMessage += `${i > 0 ? '\n' : ''}${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name} hits a new ATH at ${currency_symbol}${numberOptimizeDecimal(numeral(highPrice).format(`0,0${highPrice >= 100 ? '' : highPrice >= 1 ? '.00' : '.00000000'}`))}. 🚀`;
    });

    const id = `${dynamodb_feeds_type}_${moment().unix()}_ath`;

    // add message
    if (telegramMessage) {
      telegramData.push(telegramMessage);

      // add feed
      feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: telegramMessage, Json: JSON.stringify(data) });
    }

    // coin url
    twitterMessage += data.length === 1 ? data.map(c => `\n${website_url}/coin/${c.id}`) : '';

    // add hashtag
    twitterMessage += `\n\n${data.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} #crypto #cryptocurrencies`;

    // add message
    if (twitterMessage) {
      twitterData.push({ id, text: twitterMessage, data, extra: 'ath' });
    }
  }

  if (allTimeLowData && allTimeLowData.length > 0) {
    hasAllTime = true;

    let telegramMessage = '';
    let twitterMessage = '';

    const data = _.slice(allTimeLowData, 0, 3).map(c => { return { ...c, low_price: _.min([c.atl, c.current_price, c.low_24h].filter(x => typeof x === 'number')) }; });
    data.forEach((c, i) => {
      const lowPrice = c.low_price;

      // title
      telegramMessage += `${i === 0 ? '‼️ ALL TIME LOW' : ''}\n`;

      // coin message
      telegramMessage += `<a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a> <pre>${currency_symbol}${numberOptimizeDecimal(numeral(lowPrice).format(`0,0${lowPrice >= 100 ? '' : lowPrice >= 1 ? '.00' : '.00000000'}`))}</pre>`;

      // coin message
      twitterMessage += `${i > 0 ? '\n' : ''}${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name} made a new ATL at ${currency_symbol}${numberOptimizeDecimal(numeral(lowPrice).format(`0,0${lowPrice >= 100 ? '' : lowPrice >= 1 ? '.00' : '.00000000'}`))}. 🤕`;
    });

    const id = `${dynamodb_feeds_type}_${moment().unix()}_atl`;

    // add message
    if (telegramMessage) {
      telegramData.push(telegramMessage);
    
      // add feed
      feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: telegramMessage, Json: JSON.stringify(data) });
    }

    // coin url
    twitterMessage += data.length === 1 ? data.map(c => `\n${website_url}/coin/${c.id}`) : '';

    // add hashtag
    twitterMessage += `\n\n${data.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} #crypto #cryptocurrencies`;

    // add message
    if (twitterMessage) {
      twitterData.push({ id, text: twitterMessage, data, extra: 'atl' });
    }
  }

  if (!hasAllTime) {
    const isRunTwitter = Number(moment().minutes()) === 0 && Number(moment().hours()) % 4 === 2;

    const randNumber = Math.floor(Math.random() * 9);

    if (randNumber < 3) {
      let id;

      if (marketCapDataSorted && marketCapDataSorted.length > 0) {
        let message = '';
        const data = _.slice(marketCapDataSorted.filter(c => c.price_change_percentage_24h_in_currency_abs >= 5), 0, 3);

        data.forEach((c, i) => {
          // title
          message += `${i === 0 ? `🧐 <a href="${website_url}/coins">High % Change</a>` : ''}\n`;

          // coin message
          message += `<a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a> <b>${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}</b> <pre>${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</pre>`;
        });

        id = `${dynamodb_feeds_type}_${moment().unix()}_marketcap`;

        // add message
        if (message) {
          telegramData.push(message);

          // add feed
          feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(data) });
        }
      }

      if (isRunTwitter && marketCapDataSorted && marketCapDataSorted.length > 0) {
        let message = '';
        const data = _.slice(marketCapDataSorted.filter(c => c.price_change_percentage_24h_in_currency_abs >= 5), 0, 3);
        data.forEach((c, i) => {
          // title
          message += `${i === 0 ? `Let's check on the top${data.length > 1 ? ` ${data.length}` : ''} % changes 🧐` : ''}\n`;

          // coin message
          message += `${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name} ${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))} ${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}`;
        });

        // coins url
        message += data.length === 1 ? data.map(c => `\n${website_url}/coin/${c.id}`) : `\n${website_url}/coins`;

        // add hashtag
        message += `\n\n❤️ if you HODL any one of them\n\n${data.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} `;

        // add message
        if (message) {
          twitterData.push({ id, text: message, data });
        }
      }
    }
    else if (randNumber < 6) {
      let id;

      if (trendingDataSorted && trendingDataSorted.length > 0) {
        let message = '';
        const data =_.slice(trendingDataSorted, 0, 3);

        data.forEach((c, i) => {
          // title
          message += `${i === 0 ? `🤔 <a href="${website_url}">Trending Now</a>` : ''}\n`;

          // coin message
          message += `<b>${c.name}</b><a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a>\n${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))} <pre>${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</pre>`;
        });

        id = `${dynamodb_feeds_type}_${moment().unix()}_trending`;

        // add message
        if (message) {
          telegramData.push(message);

          // add feed
          feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(data) });
        }
      }

      if (isRunTwitter && trendingDataSorted && trendingDataSorted.length > 0) {
        let message = '';
        const data = _.slice(trendingDataSorted, 0, 3);
        data.forEach((c, i) => {
          // coins message
          message += `${i === 0 ? '' : i === data.length - 1 ? ' and ' : ', '}${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name}`;
        });

        // message
        message += ` are trending now.\nLet's check'em out! 🔥🔥🔥`;

        // coins url
        message += data.length === 1 ? data.map(c => `\n${website_url}/coin/${c.id}`) : `\n${website_url}`;

        // add hashtag
        message += `\n\n${data.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} `;

        // add message
        if (message) {
          twitterData.push({ id, text: message, data });
        }
      }
    }
    else if (randNumber < 7) {
      let id;

      if (defiDataSorted && defiDataSorted.length > 0) {
        let message = '';
        const data = _.slice(defiDataSorted, 0, 3);

        data.forEach((c, i) => {
          // title
          message += `${i === 0 ? `🦄 <a href="${website_url}/coins/decentralized-finance-defi">Top DeFi</a>` : ''}\n`;

          // coin message
          message += `<a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a> <b>${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}</b> <pre>${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</pre>`;
        });

        id = `${dynamodb_feeds_type}_${moment().unix()}_defi`;

        // add message
        if (message) {
          telegramData.push(message);

          // add feed
          feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(data) });
        }
      }

      if (isRunTwitter && defiDataSorted && defiDataSorted.length > 0) {
        let message = '';
        const data = _.slice(defiDataSorted, 0, 3);
        data.forEach((c, i) => {
          // title
          message += `${i === 0 ? `🦄 Update on the top${data.length > 1 ? ` ${data.length}` : ''} DeFi from their last 24h prices:` : ''}\n`;

          // coin message
          message += `${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name} ${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))} ${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}`;
        });

        // coins url
        message += data.length === 1 ? data.map(c => `\n${website_url}/coin/${c.id}`) : `\n${website_url}/coins/decentralized-finance-defi`;

        // add hashtag
        message += `\n\n#DeFi ${data.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} `;

        // add message
        if (message) {
          twitterData.push({ id, text: message, data });
        }
      }
    }
    else {
      let id;

      if (nftsDataSorted && nftsDataSorted.length > 0) {
        let message = '';
        const data = _.slice(nftsDataSorted, 0, 3);

        data.forEach((c, i) => {
          // title
          message += `${i === 0 ? `🌠 <a href="${website_url}/coins/non-fungible-tokens-nft">Top NFTs</a>` : ''}\n`;

          // coin message
          message += `<a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a> <b>${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}</b> <pre>${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</pre>`;
        });

        id = `${dynamodb_feeds_type}_${moment().unix()}_nfts`;

        // add message
        if (message) {
          telegramData.push(message);

          // add feed
          feedsData.push({ id, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(data) });
        }
      }

      if (isRunTwitter && nftsDataSorted && nftsDataSorted.length > 0) {
        let message = '';
        const data = _.slice(nftsDataSorted, 0, 3);
        data.forEach((c, i) => {
          // title
          message += `${i === 0 ? `🌠 Update on the top${data.length > 1 ? ` ${data.length}` : ''} NFTs from their last 24h prices:` : ''}\n`;

          // coin message
          message += `${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name} ${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))} ${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}`;
        });
        // coins url
        message += data.length === 1 ? data.map(c => `\n${website_url}/coin/${c.id}`) : `\n${website_url}/coins/non-fungible-tokens-nft`;

        // add hashtag
        message += `\n\n#NFTs ${data.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} `;

        // add message
        if (message) {
          twitterData.push({ id, text: message, data });
        }
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

        let telegramMessage = '';
        let twitterMessage = '';
        coinsData.forEach((c, i) => {
          // title
          telegramMessage += `${i === 0 ? `<a href="${website_url}">${marketStatus === 'panic' ? '😱 Panic Selling' : '🤩 FOMO Buying'}</a>` : ''}\n`;

          // coin message
          telegramMessage += `<a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a> <b>${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}</b> <pre>${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</pre>`;

          // title
          twitterMessage += `${i === 0 ? `${marketStatus === 'panic' ? '😱 Some panic selling detected:' : '🤩 Some FOMO buying detected:'}` : ''}\n`;

          // coin message
          twitterMessage += `${c.symbol ? `$${c.symbol.toUpperCase()}` : c.name} ${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))} ${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}`;
        });

        const id = `${dynamodb_feeds_type}_${moment().unix()}_${marketStatus}`;

        // add message
        if (telegramMessage) {
          telegramData = [telegramMessage];//.concat(telegramData);

          // add feed
          feedsData = [{ id, FeedType: dynamodb_feeds_type, Message: telegramMessage, Json: JSON.stringify(coinsData) }];//.concat(feedsData);
        }

        if (!hasAllTime && Number(moment().hours()) % 2 === 0) {
          // coins url
          twitterMessage += coinsData.length === 1 ? coinsData.map(c => `\n${website_url}/coin/${c.id}`) : `\n${website_url}/coins`;

          // add hashtag
          twitterMessage += `\n\n${coinsData.map(c => `${c.name ? `#${c.name.split(' ').filter(x => x).join('')}` : ''}`).join(' ')} `;

          // add message
          if (twitterMessage) {
            twitterData = [{ id, text: twitterMessage, data: coinsData }];
          }
        }
      }
    }
  }

  if (!marketStatus && Number(moment().minutes()) === 0 && Number(moment().hours()) % 4 === 0 && marketCapDataSorted.findIndex(c => c.id === 'bitcoin') > -1) {
    const c = marketCapDataSorted[marketCapDataSorted.findIndex(c => c.id === 'bitcoin')];
    const telegramMessage = `Today's <a href="${website_url}/coin/${c.id}">${c.symbol ? c.symbol.toUpperCase() : 'See more'}</a> price <b>${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))}</b> <pre>${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')}</pre>`;

    const id = `${dynamodb_feeds_type}_${moment().unix()}_bitcoin`;

    // add message
    if (telegramMessage) {
      telegramData = [telegramMessage];//.concat(telegramData);

      // add feed
      feedsData = [{ id, FeedType: dynamodb_feeds_type, Message: telegramMessage, Json: JSON.stringify([c]) }];//.concat(feedsData);
    }

    if (Number(moment().hours()) % 24 === 0) {
      let twitterMessage = `Today's #${c.name} price is ${currency_symbol}${numberOptimizeDecimal(numeral(c.current_price).format(`0,0${c.current_price >= 100 ? '' : c.current_price >= 1 ? '.00' : '.00000000'}`))} ${numeral(c.price_change_percentage_24h_in_currency / 100).format('+0,0.00%')} from yesterday.`;

      // coin url
      twitterMessage += `\n${website_url}/coin/${c.id}`;

      // add hashtag
      twitterMessage += `\n\n${c.symbol ? `$${c.symbol.toUpperCase()} ` : ''}#Crypto #Cryptocurrency`;

      // add message
      if (twitterMessage) {
        twitterData = [{ id, text: twitterMessage, data: [c] }];
      }
    }
  }

  // normalize twitter data for social poster
  if (twitterData && twitterData.length > 0) {
    twitterData = twitterData.map(_twitterData => {
      return {
        ..._twitterData,
        // add hashtag
        text: `${_twitterData.text}${_twitterData.text.endsWith(' ') ? `#Crypto #Cryptocurrency ${_twitterData.text.indexOf('#Bitcoin') < 0 ? ' #Altcoin #Bitcoin' : ''} #CryptoNews` : ''}`,
        // add widget url
        data: _twitterData.data && _twitterData.data.map(c => {
          // return { ...c, widget_url: `${website_url}/widget/coin/${c.id}?theme=dark${_twitterData.extra ? `&extra=${_twitterData.extra}` : ''}` };
          return { ...c };
        }),
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
            _twitterData.data[0].widget_url = `http://v2.coinhippo.io.s3-website-us-east-1.amazonaws.com/feeds?view=widget&theme=dark&id=${saveResponse.data.SortKey}`//`${website_url}/feeds?view=widget&theme=dark&id=${saveResponse.data.SortKey}`;
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