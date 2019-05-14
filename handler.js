'use strict';
const util = require('util');
const AWS = require('aws-sdk');
module.exports.hello = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',

    }, null, 2),
  };

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
};

const sendMessageToClient = (url, connectionId, payload) => new Promise((resolve, reject) => {
  const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({apiVersion: '2029', endpoint: url});
  apigatewaymanagementapi.postToConnection({
    ConnectionId: connectionId, // connectionId of the receiving ws-client
    Data: JSON.stringify(payload),
  }, (err, data) => {
    if (err) {
      console.log('err is', err);
      reject(err);
    }
    resolve(data);
  });
});

module.exports.csock = async (event, context) => {
  console.log("connected: ", event.requestContext.connectionId);

  return {
    statusCode: 200
  };
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


