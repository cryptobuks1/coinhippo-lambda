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
  const api_host = process.env.REQUESTER_API_HOST || 'https://yivbr6i51h.execute-api.us-east-1.amazonaws.com/default/requester';
  const website_url = process.env.WEBSITE_URL || 'https://coinhippo.io';
  const app_name = process.env.APP_NAME || 'CoinHippo';
  // aws s3
  const aws_s3_url = process.env.BLOG_AWS_S3_URL || 'https://s3.amazonaws.com';
  const aws_s3_bucket = process.env.BLOG_AWS_S3_BUCKET || 'assets.coinhippo.io';
  // default meta
  const default_title = process.env.DEFAULT_TITLE || `Today's Cryptocurrency Prices & Market Capitalization | CoinHippo`;
  const default_description = process.env.DEFAULT_DESCRIPTION || `Update on current top coins by market cap, leading exchange by confidences, trending search, DeFi, DEX, Futures Derivatives, and other exciting information in #crypto world.`;
  // dynamic paths
  const dynamic_paths = ['coin','exchange'];
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
    path = path.includes('?') ? path.substring(0, path.indexOf('?')) : path;

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
        title = `Coins - High Volume | ${app_name}`;
        description = `See the list of top cryptocurrency prices by volume, along with their statistics that matter.`;
      }
      else if (pathSplit[1] === 'categories') {
        title = `Coins - Category | ${app_name}`;
        description = `See the list of cryptocurrencies by category, along with their statistics that matter.`;
      }
      else if (pathSplit[1]) {
        title = `${getName(pathSplit[1], true, data)} | ${app_name}`;
        description = `See the list of cryptocurrencies by type, along with their statistics that matter.`;
      }
      else {
        title = `Coins | ${app_name}`;
        description = `See the list of top cryptocurrency prices by market capitalization, along with their statistics that matter.`;
      }
    }
    else if (pathSplit[0] === 'coin') {
      if (data) {
        title = `${data.name} ${data.symbol ? `${data.symbol.toUpperCase()} ` : ''}| ${app_name}`;
        description = `Get the latest ${data.name} price, ${data.symbol ? `${data.symbol.toUpperCase()} ` : ''}market cap, Technical charts and other information related to ${data.name}.`;
        image = data.image && data.image.large ? data.image.large : image;
      }
    }
    else if (pathSplit[0] === 'derivatives') {
      if (pathSplit[1] === 'futures') {
        title = `Top Cryptocurrencies' Derivatives Futures Contract | ${app_name}`;
        description = `See the list of cryptocurrencies' derivatives contracts by open interest, along with their statistics that matter.`;
      }
      else {
        title = `Top Cryptocurrencies' Derivatives Perpetual Contract | ${app_name}`;
        description = `See the list of cryptocurrencies' derivatives contracts by open interest, along with their statistics that matter.`;
      }
    }
    else if (pathSplit[0] === 'exchanges') {
      if (pathSplit[1] === 'dex') {
        title = `Top Decentralized Exchanges by Volume | ${app_name}`;
        description = `See the list of top decentralized exchanges by volume, along with their statistics that matter.`;
      }
      else if (pathSplit[1] === 'derivatives') {
        title = `Top Derivatives Exchanges by Volume | ${app_name}`;
        description = `See the list of top derivatives exchanges by volume, along with their statistics that matter.`;
      }
      else {
        title = `Top Exchanges by Confidence | ${app_name}`;
        description = `See the list of top exchanges by confidence, along with their statistics that matter.`;
      }
    }
    else if (pathSplit[0] === 'exchange') {
      if (data) {
        title = `${data.name} Trade Volume, Trade Pairs, Market Listing | ${app_name}`;
        description = `Find out ${data.name} trading volume, fees, pair list and other updated information. See the most actively traded coins on ${data.name}.`;
        image = typeof data.image === 'string' ? data.image.replace('small', 'large') : image;
      }
    }
    else if (pathSplit[0] === 'watchlist') {
      title = `Watchlist | ${app_name}`;
      description = `Build your own personalized watchlist, and keep track of your favorite cryptocurrencies.`;
    }
    else if (pathSplit[0] === 'public-companies') {
      if (pathSplit[1]) {
        title = `${getName(pathSplit[1], true)} Holdings by Public Companies | ${app_name}`;
        description = `See the list of publicly traded companies that are buying ${getName(pathSplit[1], true)} as part of corporate treasury.`;
      }
      else {
        title = `Crypto Holdings by Public Companies | ${app_name}`;
        description = `See the list of publicly traded companies that are buying crypto as part of corporate treasury.`;
      }
    }
    else if (pathSplit[0] === 'parachains') {
      title = `${getName(pathSplit[1], true)} Parachain | ${app_name}`;
      description = `See the list of ${getName(pathSplit[1], true)} parachain projects`;
    }
    else if (pathSplit[0] === 'wallet') {
      if (pathSplit[1]) {
        description = `Scan wallet and see assets inside`;
      }
      else {
        title = `Wallet Explorer | ${app_name}`;
        description = `Scan wallet and see assets inside`;
      }
    }
    else if (pathSplit[0] === 'farm') {
      if (pathSplit[1]) {
        title = `DeFi Farming in ${getName(pathSplit[1], true, data)} | ${app_name}`;
        description = `See top available pools in ${getName(pathSplit[1], true, data)}, along with their liquidity, volume, and other important information.`;
      }
      else {
        title = `DeFi Farming | ${app_name}`;
        description = `See top available pools, along with their liquidity, volume, and other important information.`;
      }
    }
    else if (pathSplit[0] === 'feeds') {
      title = `Cryptocurrency Feed | ${app_name}`;
      description = `Catch up on price changes, trading signals, trends, and news in #crypto world.`;
    }
    else if (pathSplit[0] === 'widgets') {
      title = `Widgets | ${app_name}`;
      description = `Embed ${app_name}'s cryptocurrency widgets to your website or blog for free.`;
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