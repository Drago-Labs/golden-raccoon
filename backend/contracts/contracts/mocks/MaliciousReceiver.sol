// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVaultTarget {
    function withdraw(address token, uint256 amount, address recipient, bytes32 intentHash) external;
    function deposit(address token, uint256 amount) external;
}

/// @title MaliciousReceiver
/// @notice Hostile receiver contract attempting reentrancy into GoldRaccoonVault or tokens.
contract MaliciousReceiver {
    address public targetVault;
    address public targetToken;
    uint256 public attackAmount;
    bytes32 public attackIntentHash;
    bool public attackOnReceive;
    uint256 public attackCount;

    event AttackAttempted(uint256 count, bool success);

    constructor(address _vault, address _token) {
        targetVault = _vault;
        targetToken = _token;
    }

    /// @notice Configure attack parameters for reentrancy attempt
    /// @param _amount Withdrawal amount to attempt
    /// @param _intentHash Intent hash to attempt reusing
    /// @param _enable Whether to trigger attack on receive/fallback
    function setAttackParams(
        uint256 _amount,
        bytes32 _intentHash,
        bool _enable
    ) external {
        attackAmount = _amount;
        attackIntentHash = _intentHash;
        attackOnReceive = _enable;
    }

    /// @notice Manually trigger attack call to vault
    function triggerAttack() external {
        if (targetVault != address(0)) {
            attackCount++;
            (bool ok, ) = targetVault.call(
                abi.encodeWithSelector(
                    IVaultTarget.withdraw.selector,
                    targetToken,
                    attackAmount,
                    address(this),
                    attackIntentHash
                )
            );
            emit AttackAttempted(attackCount, ok);
        }
    }

    receive() external payable {
        if (attackOnReceive && targetVault != address(0)) {
            attackCount++;
            (bool ok, ) = targetVault.call(
                abi.encodeWithSelector(
                    IVaultTarget.withdraw.selector,
                    targetToken,
                    attackAmount,
                    address(this),
                    attackIntentHash
                )
            );
            emit AttackAttempted(attackCount, ok);
        }
    }

    fallback() external payable {
        if (attackOnReceive && targetVault != address(0)) {
            attackCount++;
            (bool ok, ) = targetVault.call(
                abi.encodeWithSelector(
                    IVaultTarget.withdraw.selector,
                    targetToken,
                    attackAmount,
                    address(this),
                    attackIntentHash
                )
            );
            emit AttackAttempted(attackCount, ok);
        }
    }
}
