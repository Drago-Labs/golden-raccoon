// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ReentrantToken
/// @notice Hostile ERC20 token designed to attempt reentrancy during transfer or transferFrom calls.
contract ReentrantToken is ERC20 {
    address public reentrancyTarget;
    bytes public reentrancyCallData;
    bool public attackOnTransfer;
    bool public attackOnTransferFrom;
    bool public revertOnAttackFailure;
    uint256 public attackCount;
    bool public attackSuccess;

    constructor() ERC20("Reentrant Mock Token", "REENT") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    /// @notice Mint tokens to target address
    /// @param to Recipient address
    /// @param amount Token quantity to mint
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Set reentrancy attack target and payload
    /// @param target Contract address to call during token transfer
    /// @param data ABI-encoded calldata for reentrant call
    /// @param onTransfer Whether to attack during transfer
    /// @param onTransferFrom Whether to attack during transferFrom
    /// @param revertIfFailed Whether to bubble revert if reentrant call fails
    function setReentrancyTarget(
        address target,
        bytes calldata data,
        bool onTransfer,
        bool onTransferFrom,
        bool revertIfFailed
    ) external {
        reentrancyTarget = target;
        reentrancyCallData = data;
        attackOnTransfer = onTransfer;
        attackOnTransferFrom = onTransferFrom;
        revertOnAttackFailure = revertIfFailed;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (attackOnTransfer && reentrancyTarget != address(0)) {
            attackOnTransfer = false;
            attackCount++;
            (bool success, bytes memory returndata) = reentrancyTarget.call(reentrancyCallData);
            attackSuccess = success;
            if (revertOnAttackFailure && !success) {
                assembly {
                    revert(add(32, returndata), mload(returndata))
                }
            }
        }
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attackOnTransferFrom && reentrancyTarget != address(0)) {
            attackOnTransferFrom = false;
            attackCount++;
            (bool success, bytes memory returndata) = reentrancyTarget.call(reentrancyCallData);
            attackSuccess = success;
            if (revertOnAttackFailure && !success) {
                assembly {
                    revert(add(32, returndata), mload(returndata))
                }
            }
        }
        return super.transferFrom(from, to, amount);
    }
}
