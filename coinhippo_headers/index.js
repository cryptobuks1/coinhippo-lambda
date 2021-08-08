/************************************************
 * This code is a function for send meta tags to social meta tags resolver and crawler.
 * Deploy on AWS Lambda (using AWS Lambda@Edge)
 ************************************************/
 exports.handler = async (event, context, callback) => {
   // import module for submitting request.
  const axios = require('axios');

  // import modules
  const _ = require('lodash');

  // function for capitalize word or phrase
  const capitalize = s => typeof s !== 'string' ? '' : s.trim().split(' ').join('_').split('-').join('_').split('_').map(x => x.trim()).filter(x => x).map(x => `${x.substr(0, 1).toUpperCase()}${x.substr(1)}`).join(' ');

  // constant
  const api_host = process.env.REQUESTER_API_HOST || '{YOUR_REQUEST_API_HOST}';
  const website_url = process.env.WEBSITE_URL || 'https://coinhippo.io';
  const app_name = process.env.APP_NAME || 'CoinHippo';
  // aws s3
  const aws_s3_url = process.env.BLOG_AWS_S3_URL || 'https://s3.amazonaws.com';
  const aws_s3_bucket = process.env.BLOG_AWS_S3_BUCKET || '{YOUR_BLOG_AWS_S3_BUCKET}';
  // default meta
  const default_title = process.env.DEFAULT_TITLE || `CoinHippo | Today's Cryptocurrency Prices & Market Capitalization`;
  const default_description = process.env.DEFAULT_DESCRIPTION || `See current top coins by market cap, leading exchange by confidences, trending search, DeFi, DEX, Futures Derivatives, and other exciting information in #crypto world.`;
  // dynamic paths
  const dynamic_paths = ['coin','exchange'];
  // blockchains
  const blockchains = [
    { path: '/explorer/ethereum', title: 'Ethereum', network: 'mainnet', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/ethereum-eth-logo.png' },
    { path: '/explorer/bsc', title: 'BSC', network: 'mainnet', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/binance-coin-bnb-logo.png' },
    { path: '/explorer/matic', title: 'Polygon', network: 'mainnet', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/polygon-matic-logo.png' },
    { path: '/explorer/avalanche', title: 'Avalanche', network: 'mainnet', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/avalanche-avax-logo.png' },
    { path: '/explorer/fantom', title: 'Fantom', network: 'mainnet', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/fantom-ftm-logo.png' },
    { path: '/explorer/rsk', title: 'RSK', network: 'mainnet', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/rsk-mainnet-logo.png' },
    { path: '/explorer/arbitrum', title: 'Arbitrum', network: 'mainnet', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/arbitrum-mainnet-logo.png' },
    { path: '/explorer/moonbeam-moonriver', title: 'Moonbeam', network: 'moonriver', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/moonbeam-logo.png' },
    { path: '/explorer/moonbeam-moonbase', title: 'Moonbeam', network: 'moonbase-alpha', logo_url: 'https://www.covalenthq.com/static/images/icons/display-icons/moonbeam-logo.png' },
  ];
  // patterns for filter
  const bot_user_agent_patterns = ['facebook','twitter','google','slack','linkedin','pinterest'];
  const ignore_path_patterns = ['.js','.json','.css','.txt','.png','.xml','sitemap','/static','favicon'];

  // function for generate custom name
  const getName = (name, isCapitalize, data) => {
    if (data && data.name && dynamic_paths.indexOf(name) < 0) {
      name = data.name;
      isCapitalize = false;
    }
    const namesMap = {
      defi: 'DeFi',
      nfts: 'NFTs',
      dex: 'DEX',
      term: 'Terms of Service',
      privacy: 'Privacy Policy',
      about: 'About Us',
    };
    return namesMap[name] ? namesMap[name] : isCapitalize ? name && name.length <= 3 ? name.toUpperCase() : capitalize(name) : name;
  };

  // function for generate header meta tags
  const getPathHeaderMeta = (path, data) => {
    // normalize path
    path = !path ? '/' : path.toLowerCase();
    path = path.startsWith('/widget/') ? path.substring('/widget'.length) : path;

    // split path
    const pathSplit = path.split('/').filter(x => x);

    // generate breadcrumb
    const breadcrumb = pathSplit.filter((x, i) => !(pathSplit[0] === 'explorer' && i > 1)).map((x, i) => { return { title: getName(x, true, data), path: i === pathSplit.length - 1 ? path : `/${pathSplit.slice(0, i - (pathSplit[0] === 'explorer' && pathSplit[2] === 'tx' ? 2 : 1)).map(x => `${x}${dynamic_paths.indexOf(x) > -1 ? 's' : ''}`).join('/')}` } });

    // default meta
    let title = `${_.cloneDeep(pathSplit).reverse().map(x => getName(x, true, data)).join(' - ')}${pathSplit.length > 0 ? ` | ${app_name}` : default_title}`;
    let description = default_description;
    let image = `${aws_s3_url}/${aws_s3_bucket}/metatag_OGimage.png`;
    const url = `${website_url}${path}`;

    if (pathSplit[0] === 'coins') {
      if (pathSplit[1] === 'high-volume') {
        title = `Top Cryptocurrency Prices by High Volume | ${app_name}`;
        description = `Get the top latest cryptocurrency prices ranking by their trade volume - including their market cap, percentage changes, chart, liquidity, and more.`;
      }
      else if (pathSplit[1] === 'categories') {
        title = `Top Cryptocurrency Categories by Market Cap | ${app_name}`;
        description = `Get the top latest cryptocurrency categories ranking by their market cap - including their trade volume, percentage changes, chart, liquidity, and more.`;
      }
      else if (pathSplit[1] === 'defi') {
        title = `Top Decentralized Finance (DeFi) Coins by Market Cap | ${app_name}`;
        description = `Get the top latest decentralized finance (DeFi) coins prices ranking by their market cap - including their trade volume, percentage changes, chart, liquidity, and more.`;
      }
      else if (pathSplit[1] === 'nfts') {
        title = `Top NFTs & Collectibles Coins by Market Cap | ${app_name}`;
        description = `Get the top latest NFT (Non-fungible Token) token prices, market cap, percentage changes, chart, liquidity, and more.`;
      }
      else if (pathSplit[1] === 'bsc') {
        title = `Binance Smart Chain (BSC) Ecosystem by Market Cap | ${app_name}`;
        description = `Get top latest coins built on top of or are a part of the Binance Smart Chain (BSC) ecosystem with their prices, market cap, percentage changes, chart, liquidity, and more.`;
      }
      else if (pathSplit[1] === 'polkadot') {
        title = `Polkadot (DOT) Ecosystem by Market Cap | ${app_name}`;
        description = `Get top latest coins built on top of or are a part of the Polkadot (DOT) ecosystem with their prices, market cap, percentage changes, chart, liquidity, and more.`;
      }
      else if (pathSplit[1] === 'watchlist') {
      }
      else if (pathSplit[1]) {
        title = `${capitalize(pathSplit[1])} by Market Cap | ${app_name}`;
        description = `Get top latest coins built on top of or are a part of the ${capitalize(pathSplit[1])} with their prices, market cap, percentage changes, chart, liquidity, and more.`;
      }
      else {
        title = `Top Cryptocurrency Prices by Market Cap | ${app_name}`;
        description = `Get the top latest cryptocurrency prices ranking by their market cap - including their trade volume, percentage changes, chart, liquidity, and more.`;
      }
    }
    else if (pathSplit[0] === 'coin') {
      if (data) {
        title = `${data.name} Price to USD | ${data.symbol ? data.symbol.toUpperCase() : data.name} Value, Markets, Chart | ${app_name}`;
        description = `Explore what ${data.name} is. Get the ${data.symbol ? data.symbol.toUpperCase() : data.name} price today and convert it to your currencies; USDT, Dollars, CNY, JPY, HKD, AUD, NAIRA, EUR, GBP, THB, INR. See the BUY SELL indicator, chart history analysis, and news for FREE.`;
        image = data.image && data.image.large ? data.image.large : image;
      }
    }
    else if (pathSplit[0] === 'explorer') {
      if (pathSplit[1]) {
        const index = blockchains.findIndex(c => c.path === _.slice(pathSplit, 0, 2).map(p => `/${p}`).join(''));
        if (index > -1) {
          title = `${blockchains[index].title} (${getName(blockchains[index].network, true)}) Explorer | ${app_name}`;
          description = `Explore and search the ${blockchains[index].title} blockchain for addresses and transactions.`;
          image = blockchains[index].logo_url;
        }
        if (pathSplit[2] === 'tx') {
          title = `${blockchains[index].title} Transaction Hash: ${pathSplit[3]} | ${app_name}`;
          description = `${blockchains[index].title} detailed transaction info for txhash ${pathSplit[3]}. The transaction status, block, gas fee, and token transfer are shown.`;
        }
        else if (pathSplit[2]) {
          title = `${blockchains[index].title} address: ${pathSplit[2]} | ${app_name}`;
          description = `You can view balances, token holdings and transactions of ${blockchains[index].title} address ${pathSplit[2]}.`;
        }
      }
    }
    else if (pathSplit[0] === 'derivatives') {
      if (pathSplit[1] === 'futures') {
        title = `Today's Top Cryptocurrency Futures Contract by Open Interest | ${app_name}`;
        description = `Get the top cryptocurrency futures contract by open interest and trading volume. See their volume, changes percentage, prices history, and so on.`;
      }
      else {
        title = `Today's Top Cryptocurrency Derivatives by Open Interest | ${app_name}`;
        description = `Get the top cryptocurrency derivatives perpetual contract by open interest and trading volume. See their volume, changes percentage, prices history, and so on.`;
      }
    }
    else if (pathSplit[0] === 'exchanges') {
      if (pathSplit[1] === 'dex') {
        title = `Today's Top Decentralized Exchanges by Volume | ${app_name}`;
        description = `See the top decentralized exchanges (DEX) ranking by volume. See their information including country, volume, market share, and so on.`;
      }
      else if (pathSplit[1] === 'derivatives') {
        title = `Today's Top Cryptocurrency Derivatives Exchanges by Volume | ${app_name}`;
        description = `See the top cryptocurrency derivatives exchanges ranking by open interest. See their information including country, volume, market share, and so on.`;
      }
      else {
        title = `Today's Top Cryptocurrency Exchanges by Confidence | ${app_name}`;
        description = `See the top spot cryptocurrency exchanges ranking by confidence. See their information including country, volume, market share, and so on.`;
      }
    }
    else if (pathSplit[0] === 'exchange') {
      if (data) {
        title = `${data.name} Trade Volume, Trade Pairs, Market Listing | ${app_name}`;
        description = `Find out ${data.name} trading volume, fees, pair list and other updated information. See the most actively traded coins on ${data.name}.`;
        image = typeof data.image === 'string' ? data.image.replace('small', 'large') : image;
      }
    }
    else if (pathSplit[0] === 'news') {
      title = `Today's Latest Cryptocurrency News | ${app_name}`;
      description = `Keep up with breaking news on cryptocurrencies that influence the market.`;
    }
    else if (pathSplit[0] === 'updates') {
      title = `Cryptocurrency Project Update | ${app_name}`;
      description = `Keep up with significant cryptocurrency projects' updates, including milestone updates, partnership, fund movement, etc.`;
    }
    else if (pathSplit[0] === 'events') {
      title = `Cryptocurrency Events | ${app_name}`;
      description = `Check updated events, conferences, meetups information of cryptocurrency projects.`;
    }
    else if (pathSplit[0] === 'blog') {
      if (pathSplit[1] && data && data.meta) {
        const blogBaseUrl = `${aws_s3_url}/${aws_s3_bucket}/blog`;
        title = data.meta.title ? data.meta.title : title;
        description = data.meta.description ? data.meta.description : description;
        image = data.meta.image ? `${blogBaseUrl}/${pathSplit[1]}/${pathSplit[2] ? `posts/${pathSplit[2]}/` : ''}assets/${data.meta.image}` : image;
      }
      else {
        title = `Cryptocurrency, Blockchain Technology, and Trading Blog | ${app_name}`;
        description = `Read our high-quality and free blog post covering the cryptocurrency world and blockchain technology.`;
      }
    }
    else if (pathSplit[0] === 'widgets') {
      title = `Free Cryptocurrency Widgets | ${app_name}`;
      description = `Embed ${app_name}'s cryptocurrency widgets to your website or blog for free.`;
    }
    return { browser_title: title, title, description, url, image, breadcrumb };
  };

  // initial requester object
  const requester = axios.create({ baseURL: api_host });

  // function to request data from coingecko API on AWS by passing 2 arguments (path, params)
  const coingeckoRequest = async (path, params) => {
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

  // request object
  const request = event.Records[0].cf.request;
  // uri path
  const path = request.uri;

  if (path && request.headers && request.headers['user-agent'] && bot_user_agent_patterns.findIndex(p => request.headers['user-agent'].findIndex(u => u.value.toLowerCase().indexOf(p) > -1) > -1) > -1) {
    if (ignore_path_patterns.findIndex(p => path.indexOf(p) > -1) > -1) {
      // return
      callback(null, request);
    }
    else {
      const pathSplit = path.toLowerCase().split('/').filter(x => x);

      // initial path parameter
      let path = null;

      // initial params parameter
      let params = null;

      // get data
      let data = null;
      if (pathSplit[0] === 'coin' && pathSplit[1]) {
        path = `/coins/${pathSplit[1]}`;
        params = { localization: false, tickers: false, market_data: false, community_data: false, developer_data: false };
        data = await coingeckoRequest(path, params);
      }
      else if (pathSplit[0] === 'exchange' && pathSplit[1]) {
        path = `/exchanges/${pathSplit[1]}`;
        params = {};
        data = await coingeckoRequest(path, params);
      }
      else if (pathSplit[0] === 'blog' && pathSplit[1]) {
        path = `${aws_s3_url}/${aws_s3_bucket}/blog/${pathSplit[1]}/${pathSplit[2] ? `posts/${pathSplit[2]}/` : ''}data.json`;
        params = {};
        const res = await axios.get(path, { params: { ...(params || {}) } })
          .catch(error => { return { data: { error } }; });
        if (res && res.data && !res.data.error) {
          data = res.data;
        }
      }

      // get header meta
      const headerMeta = getPathHeaderMeta(path, data);

      // meta tag to body
      const body = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta name="theme-color" content="#050707" />
            <meta name="robots" content="index, follow" />
            <meta name="description" content="${headerMeta.description}" />
            <meta name="og:site_name" property="og:site_name" content="${headerMeta.title}" />
            <meta name="og:title" property="og:title" content="${headerMeta.title}" />
            <meta name="og:description" property="og:description" content="${headerMeta.description}" />
            <meta name="og:type" property="og:type" content="website" />
            <meta name="og:image" property="og:image" content="${headerMeta.image}" />
            <meta name="og:url" property="og:url" content="${headerMeta.url}" />
            <meta itemprop="name" content="${headerMeta.title}" />
            <meta itemprop="description" content="${headerMeta.description}" />
            <meta itemprop="thumbnailUrl" content="${headerMeta.image}" />
            <meta itemprop="image" content="${headerMeta.image}" />
            <meta itemprop="url" content="${headerMeta.url}" />
            <meta itemprop="headline" content="${headerMeta.title}" />
            <meta itemprop="publisher" content="${headerMeta.title}" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content="${headerMeta.title}" />
            <meta name="twitter:description" content="${headerMeta.description}" />
            <meta name="twitter:image" content="${headerMeta.image}" />
            <meta name="twitter:url" content="${headerMeta.url}" />
            <link rel="image_src" href="${headerMeta.image}" />
            <link rel="canonical" href="${headerMeta.url}" />
            <link rel="manifest" href="${website_url}/manifest.json" />
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
            <link rel="icon" type="image/png" sizes="16x16" href="${website_url}/favicon-16x16.png" />
            <link rel="icon" type="image/png" sizes="32x32" href="${website_url}/favicon-32x32.png" />
            <link rel="icon" type="image/png" href="${website_url}/favicon.ico" />
            <link rel="shortcut icon" type="image/png" sizes="16x16" href="${website_url}/favicon-16x16.png" />
            <link rel="shortcut icon" type="image/png" sizes="32x32" href="${website_url}/favicon-32x32.png" />
            <link rel="shortcut icon" type="image/png" href="${website_url}/favicon.ico" />
            <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#050707" />
            <meta name="msapplication-TileColor" content="#050707" />
            <title>${headerMeta.browser_title}</title>
          </head>
          <body>
            <h1>${headerMeta.title}</h1>
            <h2>${headerMeta.description}</h2>
            <p>url: ${headerMeta.url}</p>
          </body>
         </html>
      `;

      // set response
      const response = {
        status: '200',
        statusDescription: 'OK',
        body,
        headers: {
          'cache-control': [{
            key: 'Cache-Control',
            value: 'max-age=100'
          }],
          'content-type': [{
            key: 'Content-Type',
            value: 'text/html'
          }]
        }
      };

      // return response
      callback(null, response);
    }
  }
  else {
    // return
    callback(null, request);
  }
};