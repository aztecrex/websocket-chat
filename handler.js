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

const sendMessageToClient = (gw, connectionId, payload) => new Promise((resolve, reject) => {
  console.log(`sending ${payload} to ${connectionId}`);
  gw.postToConnection({
    ConnectionId: connectionId, // connectionId of the receiving ws-client
    Data: payload,
  }, (err, data) => {
    if (err) {
      console.log('err is', err);
      reject(err);
    } else {
        resolve(data);
    }
  });
  console.log(`gateway invoked ${connectionId}`);
});


const activeClients = async () =>  {
  const params = { TableName: connections, ProjectionExpression: 'connectionId' };
  const cdata = await dynamo.scan(params).promise();
  const rval = cdata.Items.map(({connectionId}) => connectionId.S);
  console.log(JSON.stringify(rval));
  return rval;
};

const sendToAll = async (gw, msg) => {
    const clients = await activeClients();
    const actions = clients.map(async cid => sendMessageToClient(gw, cid, msg).catch(err => console.log(`error sending ${msg} to ${cid}: ${err}`)));
    return Promise.all(actions);
};

const sendToAllExcept = async (gw, msg, xid) => {
  const clients = await activeClients();
  const actions = clients.map(async cid => {
    if (xid !== cid)
      return sendMessageToClient(gw, cid, msg).catch(err => console.log(`error sending ${msg} to ${cid}: ${err}`));
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
  const msg = `${event.requestContext.requestTime} ${connectionId}: ** Connected`
  await sendToAllExcept(gateway(event), msg, connectionId);
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
  const msg = `${event.requestContext.requestTime} ${connectionId}: ** Disconnected`
  await sendToAllExcept(gateway(event), msg, connectionId);
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
  if (event.body) {
    const connectionId = event.requestContext.connectionId;
    const msg = `${event.requestContext.requestTime} ${connectionId}: ${event.body}`
    await sendToAll(gateway(event), msg, event.requestContext.connectionId);
    return {
      statusCode: 200
    };
  }
};

