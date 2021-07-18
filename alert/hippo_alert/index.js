/************************************************
 * This code is a function for calculate alert data from whale alert API to post on social.
 * Deploy on AWS Lambda (triggered by AWS EventBridge)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // import modules
  const _ = require('lodash');
  const numeral = require('numeral');
  const moment = require('moment');

  // output data
  const telegramData = [];
  const twitterData = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const poster_api_host = process.env.POSTER_API_HOST || '{YOUR_POSTER_API_HOST}';
  const website_url = process.env.WEBSITE_URL || 'https://coinhippo.io';
  const explorer_url = process.env.EXPLORER_URL || 'https://explorers.coinhippo.io';
  const alert_website_url = process.env.ALERT_WEBSITE_URL || 'https://whale-alert.io';
  const alert_source_url = process.env.ALERT_SOURCE_URL || 'https://twitter.com/whale_alert';
  const alert_source_name = process.env.ALERT_SOURCE_NAME || 'Whale Alert';
  const currency_symbol = '$';
  const donation_keywords = ['charity','donation','donate'];
  const hacked_keywords = ['hack'];
  const ignore_case_words = ['for'];
  const huge_coins = ['btc','eth','usdt','busd','usdc'];
  const blockchains = [
    { chain: 'ethereum', explorer_chain: 'eth-mainnet' },
    { chain: 'bsc', explorer_chain: 'bsc-mainnet', keywords: ['binancechain'] },
    { chain: 'matic', explorer_chain: 'matic-mainnet', keywords: ['matic', 'polygon'] },
    { chain: 'avalanche', explorer_chain: 'avalanche-mainnet' },
    { chain: 'fantom', explorer_chain: 'fantom-mainnet' },
    { chain: 'rsk', explorer_chain: 'rsk-mainnet' },
    { chain: 'arbitrum', explorer_chain: 'arbitrum-mainnet' },
    { chain: 'moonriver', explorer_chain: 'moonbeam-moonriver' },
    { chain: 'moonbeam', explorer_chain: 'moonbeam-moonbase-alpha' },
  ];
  const min_amount = 10000000;

  // function for capitalize word or phrase
  const capitalize = s => typeof s !== 'string' ? '' : s.trim().split(' ').join('_').split('-').join('_').split('_').map(x => x.trim()).filter(x => x).map(x => `${ignore_case_words.indexOf(x.toLowerCase()) > -1 ? x.substr(0, 1).toLowerCase() : x.substr(0, 1).toUpperCase()}${x.substr(1)}`).join(' ');

  // function for generate repeat whale emoticon from amount
  const repeatEmoticon = (emoticon, amount, data) => [...Array(amount < (data.transaction_type !== 'transfer' ? 1.5 : data.is_donation || data.is_hacked ? 1 : 5) * min_amount ? 1 : amount < (data.transaction_type !== 'transfer' ? 3 : data.is_donation || data.is_hacked ? 2 : 10) * min_amount ? 2 : amount < (data.transaction_type !== 'transfer' ? 10 : data.is_donation || data.is_hacked ? 5 : 50) * min_amount ? 3 : 4).keys()].map(i => emoticon).join('');

  // initial requester object
  const requester = axios.create({ baseURL: api_host });

  // function to request data from whale alert API on AWS by passing 2 arguments (path, params)
  const request = async (path, params) => {
    // response data variable
    let response = null;

    try {
      // send request to your API
      const res = await requester.get('', { params: { api_name: 'whale_alert', path, ...(params || {}) } })
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

  // query time
  const now = moment().valueOf();
  const start = moment(now).subtract(3, 'minute').unix();
  const end = moment(now).unix();

  // response data variable
  let response = null;

  // initial path parameter
  let path = null;

  // initial params parameter
  let params = null;

  // request whale transactions
  path = '/transactions';
  params = { start, end };
  response = await request(path, params);
  const transactions = response && !response.error && response.transactions;

  // sorted & filtered data
  let transactionsSorted = transactions && _.orderBy(Object.entries(_.groupBy(transactions, 'hash')).map(entry => { const key = entry[0]; const value = entry[1]; return { key, value, amount: _.sumBy(value, 'amount'), amount_usd: _.sumBy(value, 'amount_usd'), timestamp: _.min(value.map(x => x.timestamp)) }; }), ['amount_usd', 'timestamp'], ['desc', 'asc']);
  transactionsSorted = transactionsSorted && transactionsSorted.filter(x => x.value && x.value.findIndex(y => y.symbol) > -1);
  transactionsSorted = transactionsSorted && transactionsSorted.map(x => { return { ...x, blockchain: _.head(x.value.map(y => y.blockchain).filter(y => y)), transaction_type: _.head(x.value.map(y => y.transaction_type).filter(y => y)), symbol: _.head(x.value.map(y => y.symbol).filter(y => y)), from_addresses: _.uniq(x.value.map(y => y.from && y.from.address ? y.from.address : '').filter(y => y)), from_address_name: _.head(x.value.map(y => y.from && y.from.owner ? y.from.owner_type === 'exchange' && y.from.owner.length <= 3 ? y.from.owner.toUpperCase() : y.from.owner : '').filter(y => y)), from_address_type: _.head(x.value.map(y => y.from && y.from.owner ? y.from.owner_type : '').filter(y => y)), to_addresses: _.uniq(x.value.map(y => y.to && y.to.address ? y.to.address : '').filter(y => y)), to_address_name: _.head(x.value.map(y => y.to && y.to.owner ? y.to.owner_type === 'exchange' && y.to.owner.length <= 3 ? y.to.owner.toUpperCase() : y.to.owner : '').filter(y => y)), to_address_type: _.head(x.value.map(y => y.to && y.to.owner ? y.to.owner_type : '').filter(y => y)), is_donation: x.transaction_type === 'transfer' && x.value.findIndex(y => y.to && y.to.owner && donation_keywords.findIndex(k => y.to.owner.toLowerCase().indexOf(k) > -1) > -1) > -1, is_hacked: x.transaction_type === 'transfer' && x.value.findIndex(y => y.from && y.from.owner && hacked_keywords.findIndex(k => y.from.owner.toLowerCase().indexOf(k) > -1) > -1) > -1 }; });
  transactionsSorted = transactionsSorted && transactionsSorted.map(x => { return { ...x, from_address_name: capitalize(x.from_address_name ? x.from_address_name.split(' ').map(y => y.replace(x.symbol, x.symbol.toUpperCase())).join(' ') : x.symbol === 'husd' ? `${x.symbol.toUpperCase()} incinerator` : 'unknown wallet'), to_address_name: capitalize(x.to_address_name ? x.to_address_name.split(' ').map(y => y.replace(x.symbol, x.symbol.toUpperCase())).join(' ') : 'unknown wallet') }; });
  transactionsSorted = transactionsSorted && transactionsSorted.filter(x => x.from_address_name && x.to_address_name && (x.from_address_name.toLowerCase().indexOf('unknown owner ') < 0 || x.to_address_name.toLowerCase().indexOf('unknown owner ') < 0));

  // process alert data
  if (transactionsSorted && transactionsSorted.length > 0) {
    // filter amount for alert on telegram
    transactionsSorted = transactionsSorted.filter(x => x.value && x.amount_usd >= (x.transaction_type !== 'transfer' ? 2 : x.is_donation || x.is_hacked ? 0.5 : 5) * (x.from_address_name.toLowerCase() === x.to_address_name.toLowerCase() && huge_coins.indexOf(x.symbol) > -1 ? 2 : 1) * min_amount);

    if (transactionsSorted.length > 0) {
      let message = '';

      // select top 5 and sort by timestamp
      _.orderBy(_.slice(transactionsSorted, 0, 5), ['timestamp'], ['asc']).forEach((x, i) => {
        // title
        message += `${i === 0 ? '🚨 <b>Hippo Alert</b>' : ''}\n`;

        // explorer url
        const index = blockchains.findIndex(c => (blockchains.findIndex(_c => _c.chain === x.blockchain) > -1 && c.keywords && c.keywords.findIndex(k => x.from_address_name.toLowerCase().indexOf(k) > -1 || x.to_address_name.toLowerCase().indexOf(k) > -1) > -1) || (c.chain === x.blockchain && blockchains.findIndex(_c => _c.chain !== c.chain && _c.keywords && _c.keywords.findIndex(k => x.from_address_name.toLowerCase().indexOf(k) > -1 || x.to_address_name.toLowerCase().indexOf(k) > -1) > -1) < 0));
        const from_url = index > -1 && x.from_addresses.length === 1 ? `${explorer_url}/${blockchains[index].explorer_chain}/address/0x${x.from_addresses[0]}` : '';
        const to_url = index > -1 && x.to_addresses.length === 1 ? `${explorer_url}/${blockchains[index].explorer_chain}/address/0x${x.to_addresses[0]}` : '';

        // transaction message
        message += `${repeatEmoticon(x.transaction_type === 'mint' ? '🖨' : x.transaction_type === 'burn' ? '🔥' : x.transaction_type === 'lock' ? '🔐' : x.transaction_type === 'unlock' ? '🔓' : x.is_donation ? '🎁' : x.is_hacked ? '🥷' : x.amount_usd < 5 * min_amount ? '🐬' : x.amount_usd < 10 * min_amount ? '🦈' : x.amount_usd < 50 * min_amount ? '🐳' : '🐋', x.amount_usd, x)} <b><a href="${alert_website_url}/transaction/${x.blockchain}/${x.key}">${x.transaction_type ? capitalize(x.is_donation ? 'donation' : x.is_hacked ? 'stolen funds' : x.transaction_type) : 'transaction'}</a></b>: ${numeral(x.amount).format('0,0')} <b>${x.symbol.toUpperCase()}</b> (${currency_symbol}${numeral(x.amount_usd).format('0,0')}) ${x.transaction_type === 'mint' ? `at <b>${to_url ? `<a href="${to_url}">` : ''}${x.to_address_name}${to_url ? '</a>' : ''}</b>` : x.transaction_type === 'burn' ? `at <b>${from_url ? `<a href="${from_url}">` : ''}${x.from_address_name}${from_url ? '</a>' : ''}</b>` : x.transaction_type === 'lock' ? `at <b>${to_url ? `<a href="${to_url}">` : ''}${x.to_address_name}${to_url ? '</a>' : ''}</b>` : x.transaction_type === 'unlock' ? `at <b>${to_url ? `<a href="${to_url}">` : ''}${x.to_address_name}${to_url ? '</a>' : ''}</b>` : `<b>${from_url ? `<a href="${from_url}">` : ''}${x.from_address_name}${from_url ? '</a>' : ''}</b> ➡️ <b>${to_url ? `<a href="${to_url}">` : ''}${x.to_address_name}${to_url ? '</a>' : ''}</b>`}`;
      });

      // add message
      if (message) {
        // credit
        message += `\n\nData from <a href="${alert_source_url}">${alert_source_name}</a>`;
        telegramData.push(message);
      }
    }

    // filter amount, select top 3 and sort by timestamp for alert on twitter
    transactionsSorted = _.orderBy(_.slice(transactionsSorted.filter(x => x.value && x.amount_usd >= (x.transaction_type !== 'transfer' ? 2.5 : x.is_donation || x.is_hacked ? 0.5 : 5) * (x.from_address_name.toLowerCase() === x.to_address_name.toLowerCase() && huge_coins.indexOf(x.symbol) > -1 ? 2 : 1) * min_amount), 0, 3), ['timestamp'], ['asc']);

    if (transactionsSorted.length > 0) {
      let message = '';

      transactionsSorted.forEach((x, i) => {
        // title
        message += `${i === 0 ? `Recent whale${transactionsSorted.length > 1 ? `s'` : `'s`} activit${transactionsSorted.length > 1 ? 'ies' : 'y'} you should be notified.` : ''}\n`;

        // transaction message
        message += `${i > 0 ? '\n' : ''}- ${repeatEmoticon(x.transaction_type === 'mint' ? '🖨' : x.transaction_type === 'burn' ? '🔥' : x.transaction_type === 'lock' ? '🔐' : x.transaction_type === 'unlock' ? '🔓' : x.is_donation ? '🎁' : x.is_hacked ? '🥷' : x.amount_usd < 5 * min_amount ? '🐬' : x.amount_usd < 10 * min_amount ? '🦈' : x.amount_usd < 50 * min_amount ? '🐳' : '🐋', x.amount_usd, x)} ${x.transaction_type ? capitalize(x.is_donation ? 'donation' : x.is_hacked ? 'stolen funds' : x.transaction_type) : 'transaction'}: ${numeral(x.amount).format('0,0')} $${x.symbol.toUpperCase()} (${currency_symbol}${numeral(x.amount_usd).format('0,0')}) ${x.transaction_type === 'mint' ? `at ${x.to_address_name}` : x.transaction_type === 'burn' ? `at ${x.from_address_name}` : x.transaction_type === 'lock' ? `at ${x.to_address_name}` : x.transaction_type === 'unlock' ? `at ${x.to_address_name}` : `${x.from_address_name} ➡️ ${x.to_address_name}`}`;
      });

      // show whale alert link when has only one alert transaction
      message += transactionsSorted.length === 1 ? transactionsSorted.map(x => `\n${alert_website_url}/transaction/${x.blockchain}/${x.key}`) : '';

      // add hashtag when has alert transaction not more than 2 transactions
      message += transactionsSorted.length > 2 ? '' : `\n\n${_.uniq(transactionsSorted.map(x => `${x.blockchain ? `#${capitalize(x.blockchain)}` : ''}`).concat(transactionsSorted.flatMap(x => [x.from_address_name && x.from_address_name.indexOf(' ') < 0 && x.from_address_name.toLowerCase().indexOf('unknown') < 0 ? `#${capitalize(x.from_address_name)}` : '', x.to_address_name && x.to_address_name.indexOf(' ') < 0 && x.to_address_name.toLowerCase().indexOf('unknown') < 0 ? `#${capitalize(x.to_address_name)}` : '']))).filter(x => x).join(' ')}`;

      // add message and data
      if (message) {
        twitterData.push({
          text: message,
          data: transactionsSorted.map(x => {
            return { ...x, widget_url: `${website_url}/widget/hippo-alert?theme=${x.transaction_type !== 'transfer' || x.is_donation || x.is_hacked ? 'dark' : 'light'}${Object.keys(x).filter(key => key !== 'value').map(key => `&${key}=${encodeURIComponent(x[key])}`).join('')}` };
          }),
        });
      }
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
    }
  };
};