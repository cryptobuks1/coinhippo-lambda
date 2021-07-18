/************************************************
 * This code is a function for posting data to social network.
 * Deploy on AWS Lambda (triggered by AWS API Gateway)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // import modules
  const chromium = require('chrome-aws-lambda');
  const TwitterClient = require('twitter-api-client').TwitterClient;

  // function for synchronous sleep
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // constant
  // telegram
  const telegram_url = process.env.TELEGRAM_API_HOST || 'https://api.telegram.org';
  const telegram_token = process.env.TELEGRAM_API_KEY || '{YOUR_TELEGRAM_API_KEY}';
  const telegram_channel = process.env.TELEGRAM_CHANNEL || '{YOUR_TELEGRAM_CHANNEL}';
  // twitter
  const twitterClient = new TwitterClient({
    apiKey: process.env.TWITTER_API_KEY || '{YOUR_TWITTER_API_KEY}',
    apiSecret: process.env.TWITTER_API_SECRET || '{YOUR_TWITTER_API_SECRET}',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '{YOUR_TWITTER_ACCESS_TOKEN}',
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '{YOUR_TWITTER_ACCESS_TOKEN_SECRET}'
  });

  // input data
  const telegramData = event.body && JSON.parse(event.body).telegram;
  const twitterData = event.body && JSON.parse(event.body).twitter;

  // error data
  let telegramError = null;
  let twitterError = null;

  // telegram
  if (telegramData && telegramData.length > 0) {
    for (let i = 0; i < telegramData.length; i++) {
      try {
        // send telegram message
        await axios.get(`${telegram_url}/bot${telegram_token}/sendMessage?chat_id=${telegram_channel}&parse_mode=html&disable_web_page_preview=true&disable_notification=${i < telegramData.length - 1}&text=${encodeURIComponent(telegramData[i])}`);
      } catch (error) {
        telegramError = error;
      }
    }
  }

  // twitter
  if (twitterData && twitterData.length > 0) {
    // load emoji font
    await chromium.font('https://raw.githack.com/googlei18n/noto-emoji/master/fonts/NotoColorEmoji.ttf');

    // initial browser
    const browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    // initial page
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    for (let i = 0; i < twitterData.length; i++) {
      try {
        const status = twitterData[i].text;
        const data = twitterData[i].data;

        // uploaded media ids
        const mediaIds = [];

        for (let j = 0; j < data.length; j++) {
          // go to page
          await page.goto(data[j].widget_url);
          await page.waitForTimeout(10000);

          // screenshot base64 data
          const media = await page.screenshot({ clip: { x: 520, y: 274, width: 400, height: 348 }, encoding: 'base64' });

          // upload media to twitter
          const response = await twitterClient.media.mediaUpload({ media_data: media, media_type: 'image/png' });

          // get media id
          if (response && response.media_id_string) {
            const media_id = response.media_id_string;
            mediaIds.push(media_id);
          
            twitterData[i].data[j] = { ...twitterData[i].data[j], media_id };
          }
        }

        if (mediaIds.length > 0) {
          // tweet
          await twitterClient.tweets.statusesUpdate({ status, media_ids: mediaIds.join(',') });

          // sleep before next status
          if (i < twitterData.length - 1) {
            await sleep(5000);
          }
        }
      } catch (error) {
        twitterError = error;
      }
    }

    // close page
    await page.close();

    // close browser
    await browser.close();
  }

  // return data
  return {
    telegram: {
      data: telegramData,
      error: telegramError,
    },
    twitter: {
      data: twitterData,
      error: twitterError,
    }
  };
};