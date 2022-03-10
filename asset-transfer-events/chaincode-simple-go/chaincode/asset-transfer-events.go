package chaincode

import (
	"encoding/json"
	"fmt"
	"strconv"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract of this fabric sample
type SmartContract struct {
	contractapi.Contract
}

// Asset describes main asset details that are visible to all organizations
type Asset struct {
	ObjectType 	string `json:"ObjectType"`
	ID					string `json:"ID"`
	Color				string `json:"Color"`
}

func (s *SmartContract) InitAssetCounter(ctx contractapi.TransactionContextInterface) error {
	err := ctx.GetStub().PutState("Red", []byte("0"))
	if err != nil {
		return fmt.Errorf("failed to put state: %v", err)
	}

	err = ctx.GetStub().PutState("Green", []byte("0"))
	if err != nil {
		return fmt.Errorf("failed to put state: %v", err)
	}

	err = ctx.GetStub().PutState("Blue", []byte("0"))
	if err != nil {
		return fmt.Errorf("failed to put state: %v", err)
	}

	return nil
}

func (s *SmartContract) CreateAsset(ctx contractapi.TransactionContextInterface, id string, color string) error {
	asset := Asset{
		ObjectType: "Asset",
		ID: id,
		Color: color,
	}

	_, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("The asset %s already exists", err)
	}

	assetJSONasBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset into JSON: %v", err)
	}

	count, err := ctx.GetStub().GetState(color)
	if err != nil {
		return fmt.Errorf("The counter for %s color: %v", color, err)
	}

	intCount, err := strconv.Atoi(string(count))
	if err != nil {
		return fmt.Errorf("failed to convert string to integer: %v", err)
	}

	intCount += 1

	strCount := strconv.Itoa(intCount)

	err = ctx.GetStub().PutState(color, []byte(strCount))
	if err != nil {
		return fmt.Errorf("failed to create asset: %v", err)
	}
	
	// ex) Green: 4
	err = ctx.GetStub().SetEvent("Create" + color + "Asset", []byte("{\"" + color + "\": \"" + strCount + "\"}"))
	if err != nil {
		return fmt.Errorf("failed to set event: %v", err)
	}

	return ctx.GetStub().PutState(id, assetJSONasBytes)
}

func (s *SmartContract) ReadAsset(ctx contractapi.TransactionContextInterface, id string) (*Asset, error) {
	assetJSONasBytes, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("The asset %s does not exist", id)
	}

	var asset *Asset
	err = json.Unmarshal(assetJSONasBytes, &asset)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON: %v", err)
	}

	return asset, nil
}

func (s *SmartContract) ReadAllAssets(ctx contractapi.TransactionContextInterface) ([]*Asset, error) {
	queryString := fmt.Sprintf("{\"selector\":{\"ObjectType\":\"Asset\"}}")
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, fmt.Errorf("Failed to get all asset from world state. %v", err)
	}
	defer resultsIterator.Close()

	assets := []*Asset{}

	for resultsIterator.HasNext() {
		result, err := resultsIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("asset not found: %v", err)
		}

		var asset *Asset
		err = json.Unmarshal(result.Value, &asset)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal JSON: %v", err)
		}

		assets = append(assets, asset)
	}
	return assets, nil
}