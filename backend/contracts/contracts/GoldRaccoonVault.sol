// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPolicyValidator {
    function getIntentValidity(bytes32 intentHash, address token, uint256 amount) external view returns (bool valid, string memory reason);
}

contract GoldRaccoonVault {
    using SafeERC20 for IERC20;

    IPolicyValidator public immutable policy;
    address public immutable agent;

    mapping(address => mapping(address => uint256)) public balances;

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount, bytes32 indexed intentHash);

    constructor(address _policy, address _agent) {
        require(_policy != address(0), "Vault: zero policy");
        require(_agent != address(0), "Vault: zero agent");
        policy = IPolicyValidator(_policy);
        agent = _agent;
    }

    function deposit(address token, uint256 amount) external {
        require(token != address(0), "Vault: zero token");
        require(amount > 0, "Vault: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount, address recipient, bytes32 intentHash) external {
        require(msg.sender == agent, "Vault: not agent");
        require(recipient != address(0), "Vault: zero recipient");
        require(token != address(0), "Vault: zero token");
        require(amount > 0, "Vault: zero amount");

        (bool valid, string memory reason) = policy.getIntentValidity(intentHash, token, amount);
        require(valid, reason);

        IERC20(token).safeTransfer(recipient, amount);
        emit Withdrawn(recipient, token, amount, intentHash);
    }

    function userBalance(address user, address token) external view returns (uint256) {
        return balances[user][token];
    }
}
