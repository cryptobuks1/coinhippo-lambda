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
  const db = new AWS.DynamoDB().DocumentClient();

  // normalize item for dynamodb validatation
  const normalizeObject = item => {
    Object.keys(item).forEach(i => {
      try {
        item[i] = JSON.parse(item[i]);
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

  if (event.queryStringParameters && event.queryStringParameters.table_name) {
    const current_timestamp = moment().unix();

    // set table name
    const table_name = event.queryStringParameters.table_name;
    delete event.queryStringParameters.table_name;
    // set method
    const method = event.queryStringParameters.method; // scan, get, put, update, delete
    delete event.queryStringParameters.method;
    // set max items
    const max_items = event.queryStringParameters.max_items || 25;
    delete event.queryStringParameters.max_items;
    // set projection expression
    const projection = event.queryStringParameters.projection || 'id, CreatedAt, Json';
    delete event.queryStringParameters.projection;
    // set filter expression
    const filter = event.queryStringParameters.filter;
    delete event.queryStringParameters.filter;
    // set key expression
    const key = event.queryStringParameters.key;
    delete event.queryStringParameters.key;
    // set update expression
    const update = event.queryStringParameters.update;
    delete event.queryStringParameters.update;

    // parameters for action
    const params = {
      TableName: table_name,
    };

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
        params.ExpressionAttributeValues = normalizeObject({ ...event.queryStringParameters });
        response = { data: await scan(params) };
        break;
      case 'get':
        params.Key = normalizeObject({ ...event.queryStringParameters });
        response = { data: await get(params) };
        break;
      case 'put':
        params.Item = normalizeObject({ ...event.queryStringParameters, CreatedAt: current_timestamp });
        response = { data: await put(params) };
        break;
      case 'update':
        params.ExpressionAttributeValues = normalizeObject({ ...event.queryStringParameters, UpdatedAt: current_timestamp });
        response = { data: await update(params) };
        break;
      case 'delete':
        params.Key = normalizeObject({ ...event.queryStringParameters });
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
        ':time': moment().subtract(2, 'days').unix().toString(),
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
        catch (error) {}
      }
    }
  }

  // return data
  return response;
};