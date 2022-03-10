/**
 * 로컬 환경에서의 사용을 목적으로 작성되었습니다.
 * 트랜잭션 Submit, Evaluate 결과는 즉시 클라이언트로 응답합니다.
 * 트랜잭션 이벤트는 소켓을 통해서 클라이언트로 전달됩니다.
 * 네트워크 구동 및 체인코드 설치, 배포가 선행되어야 합니다.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { Gateway, Wallets } = require('fabric-network');
const EventStrategies = require('fabric-network/lib/impl/event/defaulteventhandlerstrategies');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const { buildCAClient, registerAndEnrollUser, enrollAdmin } = require('../../../test-application/javascript/CAUtil.js');
const { buildCCPOrg1, buildWallet } = require('../../../test-application/javascript/AppUtil.js');

const channelName = 'mychannel';
const chaincodeName = 'asset-transfer-events-simple-go';

const org1 = 'Org1MSP';
const Org1UserId = 'appUser1';

const RED = '\x1b[31m\n';
const RESET = '\x1b[0m';

// Declaration of essential variables.
let contract;

// Initialize Gateway For Org1
async function initGatewayForOrg1(useCommitEvents) {
  const ccpOrg1 = buildCCPOrg1();
  const caOrg1Client = buildCAClient(FabricCAServices, ccpOrg1, 'ca.org1.example.com');
  const walletPathOrg1 = path.join(__dirname, '..', 'wallet', 'org1');
  const walletOrg1 = await buildWallet(Wallets, walletPathOrg1);
  await enrollAdmin(caOrg1Client, walletOrg1, org1);
  await registerAndEnrollUser(caOrg1Client, walletOrg1, org1, Org1UserId, 'org1.department1');

  try {
    const gatewayOrg1 = new Gateway();

    if (useCommitEvents) {
      await gatewayOrg1.connect(ccpOrg1, {
        wallet: walletOrg1,
        identity: Org1UserId,
        discovery: { enabled: true, asLocalhost: true }
      });
    } else {
      await gatewayOrg1.connect(ccpOrg1, {
        wallet: walletOrg1,
        identity: Org1UserId,
        discovery: { enabled: true, asLocalhost: true },
        eventHandlerOptions: EventStrategies.NONE
      });
    }

    return gatewayOrg1;
  } catch (error) {
    console.error(`Error in connecting to gateway for Org1: ${error}`);
    process.exit(1);
  }
}

/* GET home page. */
router.get('/', async (req, res) => {
  const io = req.app.get('io');

  try {
    const gateway = await initGatewayForOrg1(true);
    const network = await gateway.getNetwork(channelName);
    contract = network.getContract(chaincodeName);

    try {
      const listener = async (event) => {
        let messages = [];
        console.log(event.payload.toString());
        const color = JSON.parse(event.payload.toString());
        console.log(`$<-- Contract Event Received: ${event.eventName} - ${JSON.stringify(color)}`);
        messages.push(`Contract Event Received: ${event.eventName}`);
        messages.push(`*** Event: ${event.eventName}: ${JSON.stringify(color)}`);
        console.log(event.eventName);
        const eventTransaction = event.getTransactionEvent();
        console.log(`*** transaction: ${eventTransaction.transactionId} status:${eventTransaction.status}`);
        const eventBlock = eventTransaction.getBlockEvent();
        messages.push(`*** block: ${eventBlock.blockNumber.toString()}`);
        io.emit(`${event.eventName}Event`, messages);
      };
      await contract.addContractListener(listener);
    } catch (eventError) {
      console.log(`${RED}<-- Failed: Setup contract events - ${eventError}${RESET}`);
    }
  } catch (error) {
    console.error(`Error in setup: ${error}`);
    if (error.stack) {
      console.error(error.stack);
    }
    res.status(500).send({ msg: error });
  }
  res.sendFile(path.resolve(process.cwd(), 'views', 'index.html'));
});

// Endpoint for Chaincode Events
router.post('/asset', async (req, res) => {
  const colors = ['Red', 'Green', 'Blue'];
  const color = colors[Math.floor(Math.random() * 3)];
  const randomNumber = Math.floor(Math.random() * 1000) + 1;
  const assetKey = `item-${randomNumber}`;
  try {
    const transaction = contract.createTransaction('CreateAsset');
    await transaction.submit(assetKey, color);
    res.status(200).send({ msg: `Submit CreateAsset Result: committed, asset ${assetKey}` });
  } catch (createError) {
    res.status(500).send({ msg: `Submit Failed: CreateAsset - ${createError}` });
  }
});

router.get('/asset/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await contract.evaluateTransaction('ReadAsset', id);
    console.log(result.toString());
    res.status(200).send(JSON.parse(result.toString()));
  } catch (readError) {
    res.status(500).send({ msg: `Failed: ReadAsset - ${readError}` });
  }
});

router.get('/asset', async (req, res) => {
  try {
    const result = await contract.evaluateTransaction('ReadAllAssets');
    res.status(200).send(JSON.parse(result.toString()));
  } catch (readError) {
    res.status(500).send({ msg: [`Failed: ReadAsset - ${readError}`] });
  }
});

module.exports = router;
