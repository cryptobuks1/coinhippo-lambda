/************************************************
 * This code is a function for CRUD data from AWS DynamoDB.
 * Deploy on AWS Lambda (triggered by AWS API Gateway & AWS EventBridge)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import modules
  const moment = require('moment');
  const AWS = require('aws-sdk');

  // constant
  // aws for connect dynamodb
  AWS.config.update({
    accessKeyId: process.env.DYNAMODB_AWS_ACCESS_KEY_ID || '{YOUR_DYNAMODB_AWS_ACCESS_KEY_ID}',
    secretAccessKey: process.env.DYNAMODB_AWS_SECRET_ACCESS_KEY || '{YOUR_DYNAMODB_AWS_SECRET_ACCESS_KEY}',
    region: process.env.DYNAMODB_AWS_REGION || 'us-east-1',
  });
  // aws dynamodb
  const db = new AWS.DynamoDB();

  // normalize item for dynamodb validatation
  const normalizeObject = item => {
    Object.keys(item).forEach(i => {
      try {
        if (i !== 'Json') {
          item[i] = JSON.parse(item[i]);
        }
      } catch (error) {}

      try {
        if (typeof item[i] === 'object') {
          Object.keys(item[i]).forEach(j => {
            try {
              if (typeof item[i][j] !== 'object') {
                item[i][j] = item[i][j].toString();
              }
            } catch (error) {}
          });
        }
        else {
          if (typeof item[i] === 'string') {
            item[i] = { S: item[i] };
          }
          else if (typeof item[i] === 'number') {
            item[i] = { N: item[i].toString() };
          }
        }
      } catch (error) {}
    });

    return item;
  };

  // scan records
  const scan = params => new Promise(resolve => {
    db.scan(params, (err, data) => {
      if (err) resolve(null);
      else resolve(data.Items);
    });
  });

  // get record
  const get = params => new Promise(resolve => {
    db.getItem(params, (err, data) => {
      if (err) resolve(null);
      else resolve(data.Item);
    });
  });

  // put record
  const put = params => new Promise(resolve => {
    db.putItem(params, (err, data) => {
      if (err) resolve(null);
      else resolve(data);
    });
  });

  // update record
  const update = params => new Promise(resolve => {
    db.update(params, (err, data) => {
      if (err) resolve(null);
      else resolve(data);
    });
  });

  // delete record
  const deleteItem = params => new Promise(resolve => {
    db.delete(params, (err, data) => {
      if (err) resolve(null);
      else resolve(data);
    });
  });

  // response data variable
  let response = null;

  const body = (event.body && JSON.parse(event.body)) || event.queryStringParameters;

  if (body && body.table_name) {
    const current_timestamp = moment().unix();

    const _body = { ...body };

    // set table name
    const table_name = _body.table_name;
    delete body.table_name;
    // set method
    const method = _body.method; // scan, get, put, update, delete
    delete body.method;
    // set max items
    const max_items = _body.max_items || 25;
    delete body.max_items;
    // set projection expression
    const projection = _body.projection || 'id, CreatedAt, UpdatedAt, FeedType, Message, Json';
    delete body.projection;
    // set filter expression
    const filter = _body.filter;
    delete body.filter;
    // set key expression
    const key = _body.key;
    delete body.key;
    // set update expression
    const update = _body.update;
    delete body.update;

    // parameters for action
    const params = {
      TableName: table_name,
    };

    if (table_name === 'coinhippo-feeds' && method === 'put' && body.id) {
      body.id = `${current_timestamp}_${body.id}`;
    }

    // set scan params
    if (method === 'scan') {
      params.MaxItems = max_items;
      params.ProjectionExpression = projection;
      if (filter) {
        params.FilterExpression = filter;
      }
    }
    // set update params
    else if (method === 'update') {
      params.Key = normalizeObject({ ...key });
      if (update) {
        params.UpdateExpression = update;
      }
    }

    // do action
    switch(method) {
      case 'scan':
        params.ExpressionAttributeValues = normalizeObject({ ...body });
        response = { data: await scan(params) };
        break;
      case 'get':
        params.Key = normalizeObject({ ...body });
        response = { data: await get(params) };
        break;
      case 'put':
        params.Item = normalizeObject({ ...body, CreatedAt: current_timestamp, UpdatedAt: current_timestamp });
        response = { data: await put(params) };
        break;
      case 'update':
        params.ExpressionAttributeValues = normalizeObject({ ...body, UpdatedAt: current_timestamp });
        response = { data: await update(params) };
        break;
      case 'delete':
        params.Key = normalizeObject({ ...body });
        response = { data: await deleteItem(params) };
        break;
      default:
        break;
    }
  }
  // auto migrate data
  else {
    const table_name = 'coinhippo-feeds';

    let params = {
      TableName: table_name,
      MaxItems: 50,
      ProjectionExpression: 'id',
      FilterExpression: 'CreatedAt < :time',
      ExpressionAttributeValues: {
        ':time': moment().subtract(1, 'days').unix().toString(),
      },
    };

    response = { data: await scan(params) };

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const data = response.data;

      params = {
        TableName: table_name,
      };

      for (let i = 0; i < data.length; i++) {
        try {
          params.Key = {
            id: { S: data[i].id.S },
          };

          await deleteItem(params);
        } catch (error) {}
      }
    }
  }

  // return data
  return response;
};