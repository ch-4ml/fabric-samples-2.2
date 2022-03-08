package chaincode

import (
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract of this fabric sample
type SmartContract struct {
	contractapi.Contract
}

// Asset describes main asset details that are visible to all organizations
type Asset struct {
	ID 								string `json:"ID"`
	Color							string `json:"Color"`
	Size							string `json:"Size"`
	Owner 						string `json:"Owner"`
	AppraisedValue 		string `json:"AppraisedValue"`
	AssetProperties 	AssetProperties `json:"asset_properties"`
}

type AssetProperties struct {
	ObjectType  string `json: "object_type"`
	AssetID 		string `json: "asset_id"`
	Price 			string `json: "Price"`
	Salt 				string `json: "salt`
}

func (s *SmartContract) CreateAsset(ctx contractapi.TransactionContextInterface, id string, color string, size string, owner string, appraisedValue string) error {
	asset := Asset{
		ID: id,
		Color: color,
		Size: size,
		Owner: owner,
		AppraisedValue: appraisedValue,
	}

	err := savePrivateData(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to save private data: %v", err)
	}
	
	assetJSONasBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset into JSON: %v", err)
	}

	err = ctx.GetStub().SetEvent("CreateAsset", assetJSONasBytes);
	if err != nil {
		return fmt.Errorf("failed to set event: %v", err)
	}

	return ctx.GetStub().PutState(id, assetJSONasBytes);
}

func (s *SmartContract) TransferAsset(ctx contractapi.TransactionContextInterface, id string, newOwner string) error {
	asset, err := readState(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to transfer asset: %v", err)
	}
	asset.Owner = newOwner
	assetJSONasBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset into JSON: %v", err)
	}
	
	err = savePrivateData(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to save private data: %v", err)
	}

	err = ctx.GetStub().SetEvent("TransferAsset", assetJSONasBytes);
	if err != nil {
		return fmt.Errorf("failed to set event: %v", err)
	}

	return ctx.GetStub().PutState(id, assetJSONasBytes)
}

func (s *SmartContract) ReadAsset(ctx contractapi.TransactionContextInterface, id string) (*Asset, error) {
	asset, err := readState(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("%v", err)
	}

	err = addPrivateData(ctx, asset.ID, asset)
	if err != nil {
		return nil, fmt.Errorf("failed to add private data: %v", err)
	}

	return asset, nil
}

func (s *SmartContract) UpdateAsset(ctx contractapi.TransactionContextInterface, id string, color string, size string, owner string, appraisedValue string) error {
	asset, err := readState(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to read state: %v", err)
	}

	asset.Color = color;
	asset.Size = size;
	asset.Owner = owner;
	asset.AppraisedValue = appraisedValue;

	assetJSONasBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset into JSON: %v", err)
	}

	err = savePrivateData(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to save private data: %v", err)
	}

	err = ctx.GetStub().SetEvent("UpdateAsset", assetJSONasBytes);
	if err != nil {
		return fmt.Errorf("failed to set event: %v", err)
	}

	return ctx.GetStub().PutState(id, assetJSONasBytes)
}

func (s *SmartContract) DeleteAsset(ctx contractapi.TransactionContextInterface, id string) error {
	asset, err := readState(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to read state: %v", err)
	}

	assetJSONasBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset into JSON: %v", err)
	}

	err = removePrivateData(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to remove private data: %v", err)
	}

	err = ctx.GetStub().SetEvent("DeleteAsset", assetJSONasBytes);
	if err != nil {
		return fmt.Errorf("failed to set event: %v", err)
	}

	return ctx.GetStub().DelState(id)
}

func savePrivateData(ctx contractapi.TransactionContextInterface, assetKey string) error {
	orgCollection, err := getCollectionName(ctx)
	if err != nil {
		return fmt.Errorf("failed to infer private collection name for the org: %v", err)
	}

	err = verifyClientOrgMatchesPeerOrg(ctx)
	if err != nil {
		return nil
	}

	transientMap, err := ctx.GetStub().GetTransient()
	if err != nil {
		return fmt.Errorf("error getting transient: %v", err)
	}

	transientAssetJSON, ok := transientMap["asset_properties"]
	if !ok {
		return nil
	}

	err = ctx.GetStub().PutPrivateData(orgCollection, assetKey, transientAssetJSON)
	if err != nil {
		return fmt.Errorf("failed to put asset private details: %v", err)
	}

	return nil
}

func removePrivateData(ctx contractapi.TransactionContextInterface, assetKey string) error {
	orgCollection, err := getCollectionName(ctx)
	if err != nil {
		return fmt.Errorf("failed to infer private collection name for the org: %v", err)
	}

	err = verifyClientOrgMatchesPeerOrg(ctx)
	if err != nil {
		return nil
	}

	assetJSON, err := ctx.GetStub().GetPrivateData(orgCollection, assetKey)
	if err != nil {
		return fmt.Errorf("failed to get private data: %v", err)
	}

	if len(assetJSON) < 1 {
		return nil
	}

	err = ctx.GetStub().DelPrivateData(orgCollection, assetKey)
	if err != nil {
		return fmt.Errorf("failed to delete private data: %v", err)
	}
	
	return nil
}

func addPrivateData(ctx contractapi.TransactionContextInterface, assetKey string, asset *Asset) error {
	orgCollection, err := getCollectionName(ctx)
	if err != nil {
		return fmt.Errorf("failed to infer private collection name for the org: %v", err)
	}

	err = verifyClientOrgMatchesPeerOrg(ctx)
	if err != nil {
		return nil
	}

	assetJSON, err := ctx.GetStub().GetPrivateData(orgCollection, assetKey)
	if err != nil {
		return fmt.Errorf("failed to get private data: %v", err)
	}

	if len(assetJSON) == 0 {
		return nil
	}

	ap := AssetProperties{}
	err = json.Unmarshal(assetJSON, &ap)
	if err != nil {
		return fmt.Errorf("failed to unmarshal JSON: %v", err)
	}

	// 저장이 일부만 되는 오류 있음
	asset.AssetProperties = ap

	return nil
}

func readState(ctx contractapi.TransactionContextInterface, id string) (*Asset, error) {

	assetJSONasBytes, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("The asset %s does not exist", id)
	}

	//No Asset found, return empty response
	if assetJSONasBytes == nil {
		return nil, nil
	}

	var asset *Asset
	err = json.Unmarshal(assetJSONasBytes, &asset)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON: %v", err)
	}

	return asset, nil
}

// getCollectionName is an internal helper function to get collection of submitting client identity.
func getCollectionName(ctx contractapi.TransactionContextInterface) (string, error) {

	// Get the MSP ID of submitting client identity
	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return "", fmt.Errorf("failed to get verified MSPID: %v", err)
	}

	// Create the collection name
	orgCollection := "_implicit_org_" + clientMSPID

	return orgCollection, nil
}

// verifyClientOrgMatchesPeerOrg is an internal function used verify client org id and matches peer org id.
func verifyClientOrgMatchesPeerOrg(ctx contractapi.TransactionContextInterface) error {
	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
	
	if err != nil {
		return fmt.Errorf("failed getting the client's MSPID: %v", err)
	}

	peerMSPID, err := shim.GetMSPID()
	if err != nil {
		return fmt.Errorf("failed getting the peer's MSPID: %v", err)
	}

	if clientMSPID != peerMSPID {
		return fmt.Errorf("client from org %v is not authorized to read or write private data from an org %v peer", clientMSPID, peerMSPID)
	}

	return nil
}

func submittingClientIdentity(ctx contractapi.TransactionContextInterface) (string, error) {
	b64ID, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		return "", fmt.Errorf("Failed to read clientID: %v", err)
	}
	decodeID, err := base64.StdEncoding.DecodeString(b64ID)
	if err != nil {
		return "", fmt.Errorf("failed to base64 decode clientID: %v", err)
	}
	return string(decodeID), nil
}