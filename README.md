# CoinHippo - AWS Lambda
This project retrieve, normalize, process, aggregate and manage for [CoinHippo](https://coinhippo.io) by interact with many fantastic API.
<br>
Using Amazon services ([AWS Lambda](https://aws.amazon.com/lambda), [AWS API Gateway](https://aws.amazon.com/api-gateway), [AWS EventBridge](https://aws.amazon.com/eventbridge), [AWS S3](https://aws.amazon.com/s3), ...) to become serverless and also connected to the Social Network platforms (Twitter, Telegram).

## Functions
- [requester](/requester) - A function for request the data from many fantastic API. (using [AWS API Gateway](https://aws.amazon.com/api-gateway) as a trigger)
- [social_poster](/social_poster) - A function for write message and upload media to Telegram channel and Twitter account. (using [AWS API Gateway](https://aws.amazon.com/api-gateway) as a trigger)
- [dynamodb](/dynamodb) - A function for interact with database of feeds, watchlist, cache and etc. (using [AWS DynamoDB](https://aws.amazon.com/dynamodb) as a database)
- [blogs](/blogs) - A function for read blog posts from AWS S3 Bucket. (using [AWS API Gateway](https://aws.amazon.com/api-gateway) as a trigger)
- [coinhippo_headers](/coinhippo_headers) - A function for set the HTML meta tags for social network sharer or crawler bot. (deployed on [Lambda@Edge](https://aws.amazon.com/lambda/edge))
- [analytics](/analytics) - API and Cron job for market status and Trade signals (using [AWS API Gateway](https://aws.amazon.com/api-gateway) and [AWS EventBridge](https://aws.amazon.com/eventbridge) as a trigger)
- [alert](/alert) - Cron jobs for notify users that follow us on [Twitter](https://twitter.com/coinhippoHQ) and [Telegram](https://t.me/CoinHippoChannel) (using [AWS EventBridge](https://aws.amazon.com/eventbridge) as a trigger)
  - [fear_and_greed_alert](/alert/fear_and_greed_alert) - Bitcoin Fear & Greed Index (Data from [alternative.me](https://alternative.me))
  - [gas_alert](/alert/gas_alert) - low gas price (Data from [Etherscan](https://etherscan.io))
  - [hippo_alert](/alert/hippo_alert) - whales' activities (Data from [Whale Alert](https://whale-alert.io))
  - [markets_alert](/alert/markets_alert) - crypto prices (Data from [CoinGecko](https://www.coingecko.com))
  - [news_alert](/alert/news_alert) - crypto news (Data from [CryptoPanic](https://cryptopanic.com))

## Follow us
- [Website](https://coinhippo.io)
- [Twitter](https://twitter.com/coinhippoHQ)
- [Telegram](https://t.me/CoinHippoChannel)