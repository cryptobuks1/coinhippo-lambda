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
  let twitterData = [];
  const feedsData = [];

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const poster_api_host = process.env.POSTER_API_HOST || '{YOUR_POSTER_API_HOST}';
  const dynamodb_api_host = process.env.DYNAMODB_API_HOST || '{YOUR_DYNAMODB_API_HOST}';
  const dynamodb_table_name = process.env.DYNAMODB_TABLE_NAME || 'coinhippo-feeds';
  const dynamodb_feeds_type = 'whales';
  const website_url = process.env.WEBSITE_URL || 'https://coinhippo.io';
  const explorer_url = process.env.EXPLORER_URL || 'https://coinhippo.io/wallet';
  const alert_website_url = process.env.ALERT_WEBSITE_URL || 'https://whale-alert.io';
  const currency_symbol = '$';
  const donation_keywords = ['charity','donation','donate'];
  const hacked_keywords = ['hack'];
  const ignore_case_words = ['for'];
  const huge_coins = ['btc','eth','usdt','busd','usdc'];
  const blockchains = [
    { chain: 'ethereum', explorer_chain: 'eth-mainnet' },
    { chain: 'binancechain', explorer_chain: 'bsc-mainnet' },
    { chain: 'matic', explorer_chain: 'matic-mainnet', keywords: ['matic', 'polygon'] },
    { chain: 'avalanche', explorer_chain: 'avalanche-mainnet' },
    { chain: 'fantom', explorer_chain: 'fantom-mainnet' },
    { chain: 'moonriver', explorer_chain: 'moonbeam-moonriver' },
    // { chain: 'rsk', explorer_chain: 'rsk-mainnet' },
    // { chain: 'arbitrum', explorer_chain: 'arbitrum-mainnet' },
    // { chain: 'palm', explorer_chain: 'palm-mainnet' },
  ];
  const min_amount = 10000000;

  // function for capitalize word or phrase
  const capitalize = s => typeof s !== 'string' ? '' : s.trim().split(' ').join('_').split('-').join('_').split('_').map(x => x.trim()).filter(x => x).map(x => `${ignore_case_words.indexOf(x.toLowerCase()) > -1 ? x.substr(0, 1).toLowerCase() : x.substr(0, 1).toUpperCase()}${x.substr(1)}`).join(' ');

  // function for generate repeat whale icon from amount
  const repeatIcon = data => {
    const amount = data.amount_usd;
    const icon = data.transaction_type === 'mint' ? '🖨' : data.transaction_type === 'burn' ? '🔥' : data.transaction_type === 'lock' ? '🔐' : data.transaction_type === 'unlock' ? '🔓' : data.is_donation ? '🎁' : data.is_hacked ? '🥷' : amount <= 5 * min_amount ? '🐟' : amount <= 10 * min_amount ? '🐬' : amount <= 50 * min_amount ? '🐋' : '🐳';
    return [...Array(amount <= (data.transaction_type !== 'transfer' ? 1.5 : data.is_donation || data.is_hacked ? 1 : 5) * min_amount ? 1 : amount <= (data.transaction_type !== 'transfer' ? 3 : data.is_donation || data.is_hacked ? 2 : 10) * min_amount ? 2 : amount <= (data.transaction_type !== 'transfer' ? 10 : data.is_donation || data.is_hacked ? 5 : 50) * min_amount ? 3 : 4).keys()].map(i => icon).join('');
  };

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
  transactionsSorted = transactionsSorted && transactionsSorted.filter(x => x.from_address_name && x.to_address_name && (x.from_address_name.toLowerCase().indexOf('unknown owner ') < 0 || x.to_address_name.toLowerCase().indexOf('unknown owner ') < 0) && !(x.from && x.from.owner_type === 'exchange' && x.to && x.to.owner_type === 'exchange' && x.from_address_name === x.to_address_name));

  // process alert data
  if (transactionsSorted && transactionsSorted.length > 0) {
    // filter amount for alert on telegram
    transactionsSorted = transactionsSorted.filter(x => x.value && x.amount_usd >= (x.transaction_type !== 'transfer' ? 2 : x.is_donation || x.is_hacked ? 0.5 : 5) * (x.from_address_name.toLowerCase() === x.to_address_name.toLowerCase() && huge_coins.indexOf(x.symbol) > -1 ? 2 : 1) * min_amount);

    transactionsSorted = transactionsSorted.map(x => {
      let tx_url;

      if (x.blockchain.toLowerCase() === 'bitcoin') {
        tx_url = `https://www.blockchain.com/btc/tx/${x.key}`;
      }
      else if (x.blockchain.toLowerCase() === 'ethereum') {
        tx_url = `https://etherscan.io/tx/${!(x.key.startsWith('0x')) ? '0x' : ''}${x.key}`;
      }
      else if (x.blockchain.toLowerCase() === 'binancechain') {
        tx_url = `https://bscscan.com/tx/${!(x.key.startsWith('0x')) ? '0x' : ''}${x.key}`;
      }
      else if (x.blockchain.toLowerCase() === 'ripple') {
        tx_url = `https://xrpscan.com/tx/${x.key}`;
      }
      else if (x.blockchain.toLowerCase() === 'neo') {
        tx_url = `https://neoscan.io/transaction/${x.key}`;
      }
      else if (x.blockchain.toLowerCase() === 'eos') {
        tx_url = `https://eosflare.io/tx/${x.key}`;
      }
      else if (x.blockchain.toLowerCase() === 'stellar') {
        tx_url = `https://stellarchain.io/tx/${x.key}`;
      }
      else if (x.blockchain.toLowerCase() === 'tron') {
        tx_url = `https://tronscan.org/#/transaction/${x.key}`;
      }
      else {
        tx_url = `${alert_website_url}/transaction/${x.blockchain}/${x.key}`;
      }

      return { ...x, tx_url };
    });

    if (transactionsSorted.length > 0) {
      let message = '';
      const data = [];

      // select top 5 and sort by timestamp
      _.orderBy(_.slice(transactionsSorted, 0, 5), ['timestamp'], ['asc']).forEach((x, i) => {
        // title
        message += `${i === 0 ? '' : '\n\n'}`;

        // explorer url
        const index = blockchains.findIndex(c => (blockchains.findIndex(_c => _c.chain === x.blockchain) > -1 && c.keywords && c.keywords.findIndex(k => x.from_address_name.toLowerCase().indexOf(k) > -1 || x.to_address_name.toLowerCase().indexOf(k) > -1) > -1) || (c.chain === x.blockchain && blockchains.findIndex(_c => _c.chain !== c.chain && _c.keywords && _c.keywords.findIndex(k => x.from_address_name.toLowerCase().indexOf(k) > -1 || x.to_address_name.toLowerCase().indexOf(k) > -1) > -1) < 0));
        const from_url = index > -1 && x.from_addresses.length === 1 ? `${explorer_url}/${blockchains[index].explorer_chain}/0x${x.from_addresses[0]}` : '';
        const to_url = index > -1 && x.to_addresses.length === 1 ? `${explorer_url}/${blockchains[index].explorer_chain}/0x${x.to_addresses[0]}` : '';

        data.push({ ...x, from_url, to_url });

        // transaction message
        message += `<a href="${x.tx_url}">${repeatIcon(x)} ${x.transaction_type ? capitalize(x.is_donation ? 'donation' : x.is_hacked ? 'stolen funds' : x.transaction_type) : 'transaction'}</a> <b>${numeral(x.amount).format('0,0')} ${x.symbol.toUpperCase()}</b> <pre>${currency_symbol}${numeral(x.amount_usd).format('0,0')}</pre>\n${x.transaction_type === 'mint' ? `at ${to_url ? `<a href="${to_url}">` : ''}${x.to_address_name}${to_url ? '</a>' : ''}` : x.transaction_type === 'burn' ? `at ${from_url ? `<a href="${from_url}">` : ''}${x.from_address_name}${from_url ? '</a>' : ''}` : x.transaction_type === 'lock' ? `at ${to_url ? `<a href="${to_url}">` : ''}${x.to_address_name}${to_url ? '</a>' : ''}` : x.transaction_type === 'unlock' ? `at ${to_url ? `<a href="${to_url}">` : ''}${x.to_address_name}${to_url ? '</a>' : ''}` : `${from_url ? `<a href="${from_url}">` : ''}${x.from_address_name.replace('Unknown ', '❔')}${from_url ? '</a>' : ''} ➡️ ${to_url ? `<a href="${to_url}">` : ''}${x.to_address_name.replace('Unknown ', '❔')}${to_url ? '</a>' : ''}`}`;
      });

      // add message
      if (message) {
        telegramData.push(message);

        // add feed
        feedsData.push({ id: `${dynamodb_feeds_type}_${moment().unix()}`, FeedType: dynamodb_feeds_type, Message: message, Json: JSON.stringify(_.slice(data, 0, 3)) });
      }
    }

    // filter amount, select top 3 and sort by timestamp for alert on twitter
    transactionsSorted = _.orderBy(_.slice(transactionsSorted.filter(x => x.value && x.amount_usd >= (x.transaction_type !== 'transfer' ? 4 : x.is_donation || x.is_hacked ? 0.5 : 5) * (x.from_address_name.toLowerCase() === x.to_address_name.toLowerCase() && huge_coins.indexOf(x.symbol) > -1 ? 2 : 1) * min_amount), 0, 3), ['timestamp'], ['asc']);

    if (transactionsSorted.length > 0) {
      let message = '';

      transactionsSorted.forEach((x, i) => {
        // title
        message += `${i === 0 ? `Recent whale${transactionsSorted.length > 1 ? `s'` : `'s`} activit${transactionsSorted.length > 1 ? 'ies' : 'y'} you should be notified.` : ''}\n`;

        // transaction message
        message += `${i > 0 ? '\n' : ''}- ${repeatIcon(x)} ${x.transaction_type ? capitalize(x.is_donation ? 'donation' : x.is_hacked ? 'stolen funds' : x.transaction_type) : 'transaction'} ${numeral(x.amount).format('0,0')} $${x.symbol.toUpperCase()} (${currency_symbol}${numeral(x.amount_usd).format('0,0')})\n  ${x.transaction_type === 'mint' ? `at ${x.to_address_name}` : x.transaction_type === 'burn' ? `at ${x.from_address_name}` : x.transaction_type === 'lock' ? `at ${x.to_address_name}` : x.transaction_type === 'unlock' ? `at ${x.to_address_name}` : `${x.from_address_name.replace('Unknown ', '❔')} ➡️ ${x.to_address_name.replace('Unknown ', '❔')}`}`;

        // show whale alert link
        message += transactionsSorted.length < 3 ? `\n  ${x.tx_url}` : '';
      });

      // add hashtag when has alert transaction not more than 2 transactions
      message += transactionsSorted.length > 2 ? '' : `\n\n${_.uniq(transactionsSorted.map(x => `${x.blockchain ? `#${capitalize(x.blockchain)}` : ''}`).concat(transactionsSorted.flatMap(x => [x.from_address_name && x.from_address_name.indexOf(' ') < 0 && x.from_address_name.toLowerCase().indexOf('unknown') < 0 ? `#${capitalize(x.from_address_name)}` : '', x.to_address_name && x.to_address_name.indexOf(' ') < 0 && x.to_address_name.toLowerCase().indexOf('unknown') < 0 ? `#${capitalize(x.to_address_name)}` : '']))).filter(x => x).join(' ')} #WhaleAlert`;

      // add message and data
      if (message) {
        twitterData.push({
          text: message,
          data: transactionsSorted.map(x => {
            return {
              ...x,
              // widget_url: `${website_url}/widget/hippo-alert?theme=${x.transaction_type !== 'transfer' || x.is_donation || x.is_hacked ? 'dark' : 'light'}${Object.keys(x).filter(key => key !== 'value').map(key => `&${key}=${encodeURIComponent(x[key])}`).join('')}`
            };
          }),
        });
      }
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

        if (saveResponse.data && saveResponse.data.SortKey && twitterData) {
          twitterData = twitterData.map(_twitterData => {
            return {
              ..._twitterData,
              data: _twitterData.data && _twitterData.data.map(x => {
                return {
                  ...x,
                  widget_url: `${website_url}/feeds?view=widget&theme=${x.transaction_type !== 'transfer' || x.is_donation || x.is_hacked ? 'dark' : 'light'}&id=${saveResponse.data.SortKey}&tx=${x.key}`
                };
              })
            };
          });
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