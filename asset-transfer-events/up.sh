pushd ../test-network

./network.sh up createChannel -c mychannel -ca -s couchdb

./network.sh deployCC -ccs 1  -ccv 1 -ccep "OR('Org1MSP.peer','Org2MSP.peer')"  -ccl go -ccp ./../asset-transfer-events/chaincode-go/ -ccn asset-transfer-events-go

./network.sh deployCC -ccs 1  -ccv 1 -ccep "OR('Org1MSP.peer','Org2MSP.peer')"  -ccl javascript -ccp ./../asset-transfer-events/chaincode-javascript/ -ccn asset-transfer-events-javascript

popd