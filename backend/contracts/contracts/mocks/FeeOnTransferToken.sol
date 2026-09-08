// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title FeeOnTransferToken
/// @notice ERC20 token with configurable fee deducted on every transfer to test balance drift.
contract FeeOnTransferToken is ERC20 {
    uint256 public feeBasisPoints;
    address public feeRecipient;

    constructor(uint256 _feeBps) ERC20("Fee On Transfer Token", "FOT") {
        require(_feeBps <= 10_000, "Fee too high");
        feeBasisPoints = _feeBps;
        feeRecipient = msg.sender;
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    /// @notice Mint tokens to target address
    /// @param to Recipient address
    /// @param amount Token quantity to mint
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Set basis points deducted on transfer
    /// @param _feeBps Fee in basis points (100 = 1%)
    function setFeeBasisPoints(uint256 _feeBps) external {
        require(_feeBps <= 10_000, "Fee too high");
        feeBasisPoints = _feeBps;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * feeBasisPoints) / 10_000;
        uint256 netAmount = amount - fee;
        if (fee > 0 && feeRecipient != address(0)) {
            super.transfer(feeRecipient, fee);
        }
        return super.transfer(to, netAmount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * feeBasisPoints) / 10_000;
        uint256 netAmount = amount - fee;
        if (fee > 0 && feeRecipient != address(0)) {
            super.transferFrom(from, feeRecipient, fee);
        }
        return super.transferFrom(from, to, netAmount);
    }
}
