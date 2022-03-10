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
const chaincodeName = 'asset-transfer-events-go';

const org1 = 'Org1MSP';
const Org1UserId = 'appUser1';

const RED = '\x1b[31m\n';
const GREEN = '\x1b[32m\n';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// Declaration of essential variables.
let randomNumber,
  randomNumberForPrivateData,
  assetKey,
  assetKeyForPrivateData,
  gateway1Org1,
  gateway2Org1,
  network1Org1,
  contract1Org1,
  network2Org1,
  contract2Org1,
  transaction,
  listener,
  listenerForPrivateData;

let firstBlock = true;

// Initialize Gateway For Org1
async function initGatewayForOrg1(useCommitEvents) {
  console.log(`${GREEN}--> Fabric client user & Gateway init: Using Org1 identity to Org1 Peer${RESET}`);
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

function checkAsset(org, resultBuffer, color, size, owner, appraisedValue, price) {
  let messages = [];
  messages.push(`Query results from ${org}`);
  console.log(`${GREEN}<-- Query results from ${org}${RESET}`);

  let asset;
  if (resultBuffer) {
    asset = JSON.parse(resultBuffer.toString('utf8'));
  } else {
    console.log(`${RED}*** Failed to read asset${RESET}`);
    messages.push(`*** Failed to read asset`);
  }
  console.log(`*** verify asset ${asset.ID}`);
  messages.push(`*** verify asset ${asset.ID}`);

  if (asset) {
    messages.push(`*** asset ${asset.ID} has color ${asset.Color}`);
    messages.push(`*** asset ${asset.ID} has size ${asset.Size}`);
    messages.push(`*** asset ${asset.ID} owned by ${asset.Owner}`);
    messages.push(`*** asset ${asset.ID} has appraised value ${asset.AppraisedValue}`);
    if (asset.Color === color) {
      console.log(`*** asset ${asset.ID} has color ${asset.Color}`);
    } else {
      console.log(`${RED}*** Failed color check from ${org} - asset ${asset.ID} has color of ${asset.Color}${RESET}`);
    }
    if (asset.Size === size) {
      console.log(`*** asset ${asset.ID} has size ${asset.Size}`);
    } else {
      console.log(`${RED}*** Failed size check from ${org} - asset ${asset.ID} has size of ${asset.Size}${RESET}`);
    }
    if (asset.Owner === owner) {
      console.log(`*** asset ${asset.ID} owned by ${asset.Owner}`);
    } else {
      console.log(`${RED}*** Failed owner check from ${org} - asset ${asset.ID} owned by ${asset.Owner}${RESET}`);
    }
    if (asset.AppraisedValue === appraisedValue) {
      console.log(`*** asset ${asset.ID} has appraised value ${asset.AppraisedValue}`);
    } else {
      console.log(
        `${RED}*** Failed appraised value check from ${org} - asset ${asset.ID} has appraised value of ${asset.AppraisedValue}${RESET}`
      );
    }
    if (price) {
      messages.push(`*** asset ${asset.ID} has price ${asset.asset_properties.Price}`);
      if (asset.asset_properties && asset.asset_properties.Price === price) {
        console.log(`*** asset ${asset.ID} has price ${asset.asset_properties.Price}`);
      } else {
        console.log(
          `${RED}*** Failed price check from ${org} - asset ${asset.ID} has price of ${asset.asset_properties.Price}${RESET}`
        );
      }
    }
  }
  return messages;
}

function getTransactionData(transactionData) {
  let txData = [];

  const creator = transactionData.actions[0].header.creator;
  console.log(`    - submitted by: ${creator.mspid}-${creator.id_bytes.toString('hex')}`);
  txData.push(`- submitted by: ${creator.mspid}-${creator.id_bytes.toString('hex')}`);
  for (const endorsement of transactionData.actions[0].payload.action.endorsements) {
    console.log(`    - endorsed by: ${endorsement.endorser.mspid}-${endorsement.endorser.id_bytes.toString('hex')}`);
    txData.push(`- endorsed by: ${endorsement.endorser.mspid}-${endorsement.endorser.id_bytes.toString('hex')}`);
  }
  const chaincode = transactionData.actions[0].payload.chaincode_proposal_payload.input.chaincode_spec;
  console.log(`    - chaincode:${chaincode.chaincode_id.name}`);
  txData.push(`- chaincode:${chaincode.chaincode_id.name}`);
  console.log(`    - function:${chaincode.input.args[0].toString()}`);
  txData.push(`- function:${chaincode.input.args[0].toString()}`);
  for (let x = 1; x < chaincode.input.args.length; x++) {
    console.log(`    - arg:${chaincode.input.args[x].toString()}`);
    txData.push(`- arg:${chaincode.input.args[x].toString()}`);
  }

  return txData;
}

/* GET home page. */
router.get('/', async (req, res, next) => {
  const io = req.app.get('io');
  randomNumber = Math.floor(Math.random() * 1000) + 1;
  randomNumberForPrivateData = Math.floor(Math.random() * 1000) + 1;

  assetKey = `item-${randomNumber}`;
  assetKeyForPrivateData = `item-${randomNumberForPrivateData}`;

  try {
    gateway1Org1 = await initGatewayForOrg1(true);
    gateway2Org1 = await initGatewayForOrg1();

    network1Org1 = await gateway1Org1.getNetwork(channelName);
    network2Org1 = await gateway2Org1.getNetwork(channelName);

    contract1Org1 = network1Org1.getContract(chaincodeName);
    contract2Org1 = network2Org1.getContract(chaincodeName);

    try {
      listener = async (event) => {
        let messages = [];
        const asset = JSON.parse(event.payload.toString());

        console.log(`${GREEN}<-- Contract Event Received: ${event.eventName} - ${JSON.stringify(asset)}${RESET}`);
        messages.push(`Contract Event Received: ${event.eventName} - ${JSON.stringify(asset)}`);

        console.log(`*** Event: ${event.eventName}:${asset.ID}`);
        messages.push(`*** Event: ${event.eventName}:${asset.ID}`);

        const eventTransaction = event.getTransactionEvent();
        console.log(`*** transaction: ${eventTransaction.transactionId} status:${eventTransaction.status}`);
        messages.push(`*** transaction: ${eventTransaction.transactionId} status:${eventTransaction.status}`);

        const txData = getTransactionData(eventTransaction.transactionData);
        messages = messages.concat(txData);

        const eventBlock = eventTransaction.getBlockEvent();
        console.log(`*** block: ${eventBlock.blockNumber.toString()}`);
        messages.push(`*** block: ${eventBlock.blockNumber.toString()}`);

        io.emit('chaincode-events', messages);
      };
      console.log(`${GREEN}--> Start contract event stream to peer in Org1${RESET}`);
      await contract1Org1.addContractListener(listener);
    } catch (eventError) {
      console.log(`${RED}<-- Failed: Setup contract events - ${eventError}${RESET}`);
    }

    try {
      listenerForPrivateData = async (event) => {
        let messages = [];
        if (firstBlock) {
          console.log(
            `${GREEN}<-- Block Event Received - block number: ${event.blockNumber.toString()}` +
              '\n### Note:' +
              '\n    This block event represents the current top block of the ledger.' +
              `\n    All block events after this one are events that represent new blocks added to the ledger${RESET}`
          );
          messages.push(`Block Event Received - block number: ${event.blockNumber.toString()}`);
          messages.push(
            `### Note: This block event represents the current top block of the ledger. All block events after this one are events that represent new blocks added to the ledger`
          );
          firstBlock = false;
        } else {
          console.log(`${GREEN}<-- Block Event Received - block number: ${event.blockNumber.toString()}${RESET}`);
          messages.push(`Block Event Received - block number: ${event.blockNumber.toString()}`);
        }
        const transEvents = event.getTransactionEvents();
        for (const transEvent of transEvents) {
          console.log(`*** transaction event: ${transEvent.transactionId}`);
          messages.push(`*** transaction event: ${transEvent.transactionId}`);
          if (transEvent.privateData) {
            console.log(`!!!!! transEvent.privateData !!!!!`);
            console.log(
              transEvent.privateData.ns_pvt_rwset[0].collection_pvt_rwset[0].rwset.writes[0].value.toString()
            );
            console.log(`!!!!! transEvent.privateData !!!!!`);
            for (const namespace of transEvent.privateData.ns_pvt_rwset) {
              console.log(`    - private data: ${namespace.namespace}`);
              messages.push(`- private data: ${namespace.namespace}`);
              for (const collection of namespace.collection_pvt_rwset) {
                console.log(`     - collection: ${collection.collection_name}`);
                messages.push(`- collection: ${collection.collection_name}`);
                if (collection.rwset.reads) {
                  for (const read of collection.rwset.reads) {
                    console.log(
                      `       - read set - ${BLUE}key:${RESET} ${read.key}  ${BLUE}value:${read.value.toString()}`
                    );
                    messages.push(`- read set - key: ${read.key} value:${read.value.toString()}`);
                  }
                }
                if (collection.rwset.writes) {
                  for (const write of collection.rwset.writes) {
                    console.log(
                      `      - write set - ${BLUE}key:${RESET}${write.key} ${BLUE}is_delete:${RESET}${
                        write.is_delete
                      } ${BLUE}value:${RESET}${write.value.toString()}`
                    );
                    messages.push(
                      `- write set - key:${write.key} is_delete:${write.is_delete} value:${write.value.toString()}`
                    );
                  }
                }
              }
            }
          }
          if (transEvent.transactionData) {
            const txData = getTransactionData(transEvent.transactionData);
            messages = messages.concat(txData);
          }
          io.emit('block-events-with-private-data', messages);
        }
      };
      // now start the client side event service and register the listener
      console.log(`${GREEN}--> Start private data block event stream to peer in Org1${RESET}`);
      await network2Org1.addBlockListener(listenerForPrivateData, { type: 'private' });
    } catch (eventError) {
      console.log(`${RED}<-- Failed: Setup block events - ${eventError}${RESET}`);
    }
  } catch (error) {
    console.error(`Error in setup: ${error}`);
    if (error.stack) {
      console.error(error.stack);
    }
    res.status(500).send({ msg: error });
  }
  // TODO: 새로고침마다 객체 쌓이는지 확인
  // contract1Org1.removeContractListener(listener);
  res.render('index.html');
});

// Endpoint for Chaincode Events
router.post('/asset', async (req, res) => {
  try {
    console.log(`${GREEN}--> Submit Transaction: CreateAsset, ${assetKey} owned by Sam${RESET}`);
    transaction = contract1Org1.createTransaction('CreateAsset');
    await transaction.submit(assetKey, 'blue', '10', 'Sam', '100');
    console.log(`${GREEN}<-- Submit CreateAsset Result: committed, asset ${assetKey}${RESET}`);
    res.status(200).send({ msg: `Submit CreateAsset Result: committed, asset ${assetKey}` });
  } catch (createError) {
    console.log(`${RED}<-- Submit Failed: CreateAsset - ${createError}${RESET}`);
    res.status(500).send({ msg: `Submit Failed: CreateAsset - ${createError}` });
  }
});

router.get('/asset', async (req, res) => {
  try {
    console.log(`${GREEN}--> Evaluate: ReadAsset, - ${assetKey} should be owned by Sam${RESET}`);
    const resultBuffer = await contract1Org1.evaluateTransaction('ReadAsset', assetKey);
    const messages = checkAsset(org1, resultBuffer, 'blue', '10', 'Sam', '100');
    res.status(200).send({ msg: messages });
  } catch (readError) {
    console.log(`${RED}<-- Failed: ReadAsset - ${readError}${RESET}`);
    res.status(500).send({ msg: [`Failed: ReadAsset - ${readError}`] });
  }
});

router.put('/asset', async (req, res) => {
  try {
    console.log(`${GREEN}--> Submit Transaction: UpdateAsset ${assetKey} update appraised value to 200`);
    transaction = contract1Org1.createTransaction('UpdateAsset');
    await transaction.submit(assetKey, 'blue', '10', 'Sam', '200');
    console.log(`${GREEN}<-- Submit UpdateAsset Result: committed, asset ${assetKey}${RESET}`);
    res.status(200).send({ msg: `Submit UpdateAsset Result: committed, asset ${assetKey}` });
  } catch (updateError) {
    console.log(`${RED}<-- Failed: UpdateAsset - ${updateError}${RESET}`);
    res.status(500).send({ msg: `Failed: UpdateAsset - ${updateError}` });
  }
});

router.put('/asset/transfer', async (req, res) => {
  try {
    console.log(`${GREEN}--> Submit Transaction: TransferAsset ${assetKey} to Mary`);
    transaction = contract1Org1.createTransaction('TransferAsset');
    await transaction.submit(assetKey, 'Mary');
    console.log(`${GREEN}<-- Submit TransferAsset Result: committed, asset ${assetKey}${RESET}`);
    res.status(200).send({ msg: `Submit TransferAsset Result: committed, asset ${assetKey}` });
  } catch (transferError) {
    console.log(`${RED}<-- Failed: TransferAsset - ${transferError}${RESET}`);
    res.status(500).send({ msg: `Failed: TransferAsset - ${transferError}` });
  }
});

router.delete('/asset', async (req, res) => {
  try {
    console.log(`${GREEN}--> Submit Transaction: DeleteAsset ${assetKey}`);
    transaction = contract1Org1.createTransaction('DeleteAsset');
    await transaction.submit(assetKey);
    console.log(`${GREEN}<-- Submit DeleteAsset Result: committed, asset ${assetKey}${RESET}`);
    res.status(200).send({ msg: `Submit DeleteAsset Result: committed, asset ${assetKey}` });
  } catch (deleteError) {
    console.log(`${RED}<-- Failed: DeleteAsset - ${deleteError}${RESET}`);
    if (deleteError.toString().includes('ENDORSEMENT_POLICY_FAILURE')) {
      console.log(
        `${RED}Be sure that chaincode was deployed with the endorsement policy "OR('Org1MSP.peer','Org2MSP.peer')"${RESET}`
      );
      res.status(500).send({
        msg: `Failed: DeleteAsset - Be sure that chaincode was deployed with the endorsement policy "OR('Org1MSP.peer','Org2MSP.peer')"`
      });
    }
    res.status(500).send({ msg: `Failed: DeleteAsset - ${deleteError}` });
  }
});

// Endpoint for Block Events with Private Data
router.post('/asset/private', async (req, res) => {
  try {
    console.log(`${GREEN}--> Submit Transaction: CreateAsset, ${assetKeyForPrivateData} owned by Sam${RESET}`);
    transaction = contract2Org1.createTransaction('CreateAsset');

    const randomNumber = Math.floor(Math.random() * 100) + 1;
    const asset_properties = {
      object_type: 'asset_properties',
      asset_id: assetKeyForPrivateData,
      Price: '90',
      salt: Buffer.from(randomNumber.toString()).toString('hex')
    };
    const asset_properties_string = JSON.stringify(asset_properties);
    transaction.setTransient({
      asset_properties: Buffer.from(asset_properties_string)
    });
    transaction.setEndorsingOrganizations(org1);
    await transaction.submit(assetKeyForPrivateData, 'blue', '10', 'Sam', '100');
    console.log(`${GREEN}<-- Submit CreateAsset Result: committed, asset ${assetKeyForPrivateData}${RESET}`);
    res.status(200).send({ msg: `Submit CreateAsset Result: committed, asset ${assetKeyForPrivateData}` });
  } catch (createError) {
    console.log(`${RED}<-- Failed: CreateAsset - ${createError}${RESET}`);
    res.status(500).send({ msg: `Failed: CreateAsset - ${createError}` });
  }
});

router.get('/asset/private', async (req, res) => {
  try {
    console.log(`${GREEN}--> Evaluate: ReadAsset, - ${assetKeyForPrivateData} should be owned by Sam${RESET}`);
    const resultBuffer = await contract2Org1.evaluateTransaction('ReadAsset', assetKeyForPrivateData);
    const messages = checkAsset(org1, resultBuffer, 'blue', '10', 'Sam', '100', '90');
    res.status(200).send({ msg: messages });
  } catch (readError) {
    console.log(`${RED}<-- Failed: ReadAsset - ${readError}${RESET}`);
    res.status(500).send({ msg: [`Failed: ReadAsset - ${readError}`] });
  }
});

router.put('/asset/private', async (req, res) => {
  try {
    console.log(`${GREEN}--> Submit Transaction: UpdateAsset ${assetKeyForPrivateData} update appraised value to 200`);
    transaction = contract2Org1.createTransaction('UpdateAsset');

    const randomNumber = Math.floor(Math.random() * 100) + 1;
    const asset_properties = {
      object_type: 'asset_properties',
      asset_id: assetKeyForPrivateData,
      Price: '90',
      salt: Buffer.from(randomNumber.toString()).toString('hex')
    };
    const asset_properties_string = JSON.stringify(asset_properties);
    transaction.setTransient({
      asset_properties: Buffer.from(asset_properties_string)
    });
    transaction.setEndorsingOrganizations(org1);

    await transaction.submit(assetKeyForPrivateData, 'blue', '10', 'Sam', '200');
    console.log(`${GREEN}<-- Submit UpdateAsset Result: committed, asset ${assetKeyForPrivateData}${RESET}`);
    res.status(200).send({ msg: `Submit UpdateAsset Result: committed, asset ${assetKeyForPrivateData}` });
  } catch (updateError) {
    console.log(`${RED}<-- Failed: UpdateAsset - ${updateError}${RESET}`);
    res.status(500).send({ msg: `Failed: UpdateAsset - ${updateError}` });
  }
});

router.put('/asset/private/transfer', async (req, res) => {
  try {
    console.log(`${GREEN}--> Submit Transaction: TransferAsset ${assetKeyForPrivateData} to Mary`);
    transaction = contract2Org1.createTransaction('TransferAsset');

    const randomNumber = Math.floor(Math.random() * 100) + 1;
    const asset_properties = {
      object_type: 'asset_properties',
      asset_id: assetKeyForPrivateData,
      Price: '180',
      salt: Buffer.from(randomNumber.toString()).toString('hex')
    };
    const asset_properties_string = JSON.stringify(asset_properties);
    transaction.setTransient({
      asset_properties: Buffer.from(asset_properties_string)
    });
    transaction.setEndorsingOrganizations(org1);

    await transaction.submit(assetKeyForPrivateData, 'Mary');
    console.log(`${GREEN}<-- Submit TransferAsset Result: committed, asset ${assetKeyForPrivateData}${RESET}`);
    res.status(200).send({ msg: `Submit TransferAsset Result: committed, asset ${assetKeyForPrivateData}` });
  } catch (transferError) {
    console.log(`${RED}<-- Failed: TransferAsset - ${transferError}${RESET}`);
    res.status(500).send({ msg: `Failed: TransferAsset - ${transferError}` });
  }
});

router.delete('/asset/private', async (req, res) => {
  try {
    console.log(`${GREEN}--> Submit Transaction: DeleteAsset ${assetKeyForPrivateData}`);
    transaction = contract2Org1.createTransaction('DeleteAsset');
    await transaction.submit(assetKeyForPrivateData);
    console.log(`${GREEN}<-- Submit DeleteAsset Result: committed, asset ${assetKeyForPrivateData}${RESET}`);
    res.status(200).send({ msg: `Submit DeleteAsset Result: committed, asset ${assetKeyForPrivateData}` });
  } catch (deleteError) {
    console.log(`${RED}<-- Failed: DeleteAsset - ${deleteError}${RESET}`);
    res.status(500).send({ msg: `Failed: DeleteAsset - ${deleteError}` });
  }
});

module.exports = router;
