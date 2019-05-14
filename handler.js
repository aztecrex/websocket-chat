'use strict';
const util = require('util');
const AWS = require('aws-sdk');
const {promisify} = require("es6-promisify");

//const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({apiVersion: '2029', endpoint: url});
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-10-08" });

const putItem = p => {
  return new Promise(
    (resolve, reject) => {
      dynamo.putItem(p, (err,data) => {
        if (err) {reject (err);}
        else {resolve(data);}
      });
    }
  );
};

const deleteItem = p => {
  return new Promise(
    (resolve, reject) => {
      dynamo.deleteItem(p, (err,data) => {
        if (err) {reject (err);}
        else {resolve(data);}
      });
    }
  );
};

const connections = process.env.DYNAMODB_TABLE;

module.exports.hello = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',

    }, null, 2),
  };
};

const sendMessageToClient = (url, connectionId, payload) => new Promise((resolve, reject) => {
  resolve({});
//  apigatewaymanagementapi.postToConnection({
//    ConnectionId: connectionId, // connectionId of the receiving ws-client
//    Data: JSON.stringify(payload),
//  }, (err, data) => {
//    if (err) {
//      console.log('err is', err);
//      reject(err);
//    }
//    resolve(data);
//  });
});


const recordConnection = async id => {
  const params = {
    TableName: connections,
    Item: {
      connectionId: { S: id },
    },
  }
  return await putItem(params);
};

const forgetConnection = async id => {
  const params = {
    TableName: connections,
    Key: {
      connectionId: { S: id },
    },
  }
  return await deleteItem(params);
};

module.exports.connect = async (event, context) => {
  const connectionId = event.requestContext.connectionId;
  try {
    await recordConnection(connectionId);
  } catch(err) {
    const resp = {statusCode: 500, body: `Failed to connect: ${connectionId} ${JSON.stringify(err)}`};
    console.log(JSON.stringify(resp));
    return resp;
  }
  return {statusCode: 200, body: `connected: ${connectionId}`};
};


module.exports.disconnect = async (event, context) => {
  const connectionId = event.requestContext.connectionId;
  try {
    await forgetConnection(connectionId);
    return {statusCode: 200, body: `disconnected: ${connectionId}`};
  } catch(err) {
    const resp = {statusCode: 500, body: `Failed to disconnect: ${connectionId} ${JSON.stringify(err)}`};
    console.log(JSON.stringify(resp));
    return resp;
  }
};

module.exports.msock = async (event, context) => {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const connectionId = event.requestContext.connectionId;
  const callbackUrlForAWS = util.format(util.format('https://%s/%s', domain, stage)); //construct the needed url
  console.log("domain: ", domain);
  console.log("stage: ", stage);
  console.log("connection id: ", connectionId);
  console.log("callback url: ", callbackUrlForAWS);
  await sendMessageToClient(callbackUrlForAWS, connectionId, event);

  return {
    statusCode: 200
  };
};

