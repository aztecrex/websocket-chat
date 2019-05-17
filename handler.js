'use strict';
const util = require('util');
const AWS = require('aws-sdk');
const moment = require('moment');

const dynamo = new AWS.DynamoDB({ apiVersion: "2012-10-08" });

const putItem = p => {
  return new Promise(
    (resolve, reject) => {
      dynamo.putItem(p, (err,data) => {
        if (err) reject (err);
        else resolve(data);
      });
    }
  );
};

const deleteItem = p => {
  return new Promise(
    (resolve, reject) => {
      dynamo.deleteItem(p, (err,data) => {
        if (err) reject (err);
        else resolve(data);
      });
    }
  );
};

const connections = process.env.DYNAMODB_TABLE;

const gateway = event => {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrlForAWS = util.format(util.format('https://%s/%s', domain, stage));
  return new AWS.ApiGatewayManagementApi({apiVersion: '2029', endpoint: callbackUrlForAWS});
};

module.exports.hello = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',

    }, null, 2),
  };
};

const sendMessageToClient = (gw, from, to, payload) => new Promise((resolve, reject) => {
  console.log(`sending ${payload} to ${to}`);
  const msg = `${from} ${now()}: ${payload}`
  gw.postToConnection({
    ConnectionId: to,
    Data: msg,
  }, (err, data) => {
    if (err) {
      console.log('err is', err);
      reject(err);
    } else {
        resolve(data);
    }
  });
  console.log(`gateway invoked ${to}`);
});

const now = () => {
  return moment().local().format("YYMMDD HH:mm");

};

const activeClients = async () =>  {
  const params = { TableName: connections, ProjectionExpression: 'connectionId' };
  const cdata = await dynamo.scan(params).promise();
  const rval = cdata.Items.map(({connectionId}) => connectionId.S);
  console.log(JSON.stringify(rval));
  return rval;
};

const sendToAll = async (gw, from, msg) => {
    const clients = await activeClients();
    const actions = clients.map(async cid => sendMessageToClient(gw, from, cid, msg).catch(err => console.log(`error sending ${msg} to ${cid}: ${err}`)));
    return Promise.all(actions);
};

const sendToAllExcept = async (gw, from, msg, xid) => {
  const clients = await activeClients();
  const actions = clients.map(async cid => {
    if (xid !== cid)
      return sendMessageToClient(gw, from, cid, msg).catch(err => console.log(`error sending ${msg} to ${cid}: ${err}`));
    else
      return Promise.resolve({});
  });
  return Promise.all(actions);
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
  await sendToAllExcept(gateway(event), connectionId, '** Connected', connectionId);
  try {
    await recordConnection(connectionId);
    return {statusCode: 200, body: `connected: ${connectionId}`};
} catch(err) {
    console.log(JSON.stringify(err));
    return {statusCode: 500, body: 'Failed to connect.'};
  }
};

module.exports.disconnect = async (event, context) => {
  const connectionId = event.requestContext.connectionId;
  await sendToAllExcept(gateway(event),connectionId, '** Disconnected', connectionId);
  try {
    await forgetConnection(connectionId);
    return {statusCode: 200, body: `disconnected: ${connectionId}`};
  } catch(err) {
    console.log(JSON.stringify(err));
    return {statusCode: 500, body: 'Failed to disconnect.'};
  }
};

module.exports.msock = async (event, context) => {
  if (event.body) {
    const connectionId = event.requestContext.connectionId;
    try {
        await sendToAll(gateway(event), connectionId, event.body, event.requestContext.connectionId);
        return {statusCode: 200};
    } catch (err) {
        console.log(JSON.stringify(err));
        return {statusCode: 500, body: 'Failed to send.'};
        }
  }
};
