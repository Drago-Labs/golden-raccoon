// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SixDecimalToken
/// @notice 6-decimal ERC20 token simulating USDC/USDT to test fuzzing and decimal conversion gates.
contract SixDecimalToken is ERC20 {
    constructor() ERC20("Six Decimal Token", "USDC6") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    /// @notice Decimals override returning 6
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens to target address
    /// @param to Recipient address
    /// @param amount Token quantity to mint
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Burn tokens from target address
    /// @param from Target address to burn from
    /// @param amount Token quantity to burn
    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}
