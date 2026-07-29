// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GoldRaccoonPolicy.sol";

contract GoldRaccoonPolicyV2 is GoldRaccoonPolicy {
    string public constant V2_VERSION = "2.0.0";

    function getV2Version() external pure returns (string memory) {
        return V2_VERSION;
    }

    function upgradeMigrate() external onlyOwner {
        owner = owner;
    }
}
