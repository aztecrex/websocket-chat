'use strict';
const util = require('util');
const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB({ apiVersion: "2012-10-08" });

const putItem = p => {
  return new Promise(
    (resolve, reject) => {
      dynamo.putItem(p, (err,data) => {
        if (err) {reject (err);}
        resolve(data);
      });
    }
  );
};

const deleteItem = p => {
  return new Promise(
    (resolve, reject) => {
      dynamo.deleteItem(p, (err,data) => {
        if (err) {reject (err);}
        resolve(data);
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
  const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({apiVersion: '2029', endpoint: url});
  apigatewaymanagementapi.postToConnection({
    ConnectionId: connectionId, // connectionId of the receiving ws-client
    Data: payload,
  }, (err, data) => {
    if (err) {
      console.log('err is', err);
      reject(err);
    }
    resolve(data);
  });
});


const activeClients = async () =>  {
  const params = { TableName: connections, ProjectionExpression: 'connectionId' };
  const cdata = await dynamo.scan(params).promise();
  const rval = cdata.Items.map(({connectionId}) => connectionId.S);
  console.log(JSON.stringify(rval));
  return rval;
//   return [];
};

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
  const clients = await activeClients();

  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrlForAWS = util.format(util.format('https://%s/%s', domain, stage));
  if (event.body) {
    const msg = `${event.requestContext.requestTime}: ${event.body}`
    const actions = clients.map(async id => {
        console.log("send to: ", id);
        try {
            await sendMessageToClient(callbackUrlForAWS, id, msg);
            return {};
        } catch (err) {
            console.log(`error sending to ${id}, ignoring`);
        }
        });
    await Promise.all(actions);
  }
  return {
    statusCode: 200
  };
};

