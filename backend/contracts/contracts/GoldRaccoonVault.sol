// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GoldRaccoonVault {
    address public owner;
    address public agent;
    uint256 public maxRiskScore;
    uint256 public maxTradePercent;

    bytes32 public immutable POLICY_DOMAIN_SEPARATOR;
    bytes32 public immutable INTENT_DOMAIN_SEPARATOR;

    mapping(address => uint256) public userNonce;
    mapping(bytes32 => bool) public usedIntents;
    mapping(address => bytes32) public userPolicyHash;

    bytes32 private constant POLICY_TYPEHASH = keccak256(
        "Policy(address wallet,string chain,uint256 policyVersion,uint256 maxRiskScore,uint256 maxTradePercent,uint256 maxMemeExposurePercent,uint256 maxDailyTransactionValueUsd,uint256 maxSlippageBps,string[] allowedChains,string[] blockedTokens,string[] allowedActions,uint256 nonce,uint256 expiry)"
    );

    bytes32 private constant INTENT_TYPEHASH = keccak256(
        "ExecutionIntent(address wallet,string chain,bytes32 policyHash,bytes32 decisionHash,string fromToken,string toToken,uint256 estimatedValueUsd,uint256 maxSlippageBps,uint256 nonce,uint256 expiry)"
    );

    event AgentApproved(address indexed owner, address indexed agent);
    event RulesUpdated(address indexed owner, uint256 maxRiskScore, uint256 maxTradePercent);
    event DecisionLogged(address indexed owner, address indexed agent, string decisionHash, uint256 riskScore);
    event AgentRevoked(address indexed owner, address indexed previousAgent);
    event PolicyRegistered(address indexed wallet, bytes32 indexed policyHash, uint256 nonce);
    event IntentExecuted(address indexed wallet, bytes32 indexed intentHash, bytes32 indexed decisionHash, uint256 nonce);
    event IntentRejected(address indexed wallet, bytes32 indexed intentHash, string reason);

    modifier onlyOwner() { require(msg.sender == owner, "GR: owner"); _; }
    modifier onlyAgent() { require(msg.sender == agent, "GR: agent"); _; }

    constructor() {
        owner = msg.sender;
        POLICY_DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("GoldenRaccoonPolicy"), keccak256("1"), block.chainid, address(this)
        ));
        INTENT_DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("GoldenRaccoonExecutionIntent"), keccak256("1"), block.chainid, address(this)
        ));
    }

    function _split(bytes memory sig) private pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65, "GR: sig");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
    }

    function _verify(bytes32 ds, bytes32 sh, bytes memory sig, address signer) private view returns (bool) {
        bytes32 d = keccak256(abi.encodePacked("\x19\x01", ds, sh));
        (uint8 v, bytes32 r, bytes32 s) = _split(sig);
        return ecrecover(d, v, r, s) == signer;
    }

    function _recoverSigner(bytes32 ds, bytes32 sh, bytes memory sig) private view returns (address) {
        bytes32 d = keccak256(abi.encodePacked("\x19\x01", ds, sh));
        (uint8 v, bytes32 r, bytes32 s) = _split(sig);
        return ecrecover(d, v, r, s);
    }

    function registerPolicy(
        bytes32 structHash, uint256 nonce, uint256 expiry, bytes calldata signature
    ) external {
        require(block.timestamp <= expiry, "GR: expiry");
        address wallet = _recoverSigner(POLICY_DOMAIN_SEPARATOR, structHash, signature);
        require(wallet != address(0), "GR: recover");
        require(nonce == userNonce[wallet], "GR: nonce");
        userNonce[wallet] = nonce + 1;
        bytes32 ph = keccak256(abi.encode(POLICY_DOMAIN_SEPARATOR, structHash));
        userPolicyHash[wallet] = ph;
        emit PolicyRegistered(wallet, ph, nonce);
    }

    function executeIntent(
        bytes32 structHash, uint256 nonce, uint256 expiry, bytes calldata signature
    ) external onlyAgent {
        require(block.timestamp <= expiry, "GR: expired");
        address wallet = _recoverSigner(INTENT_DOMAIN_SEPARATOR, structHash, signature);
        require(wallet != address(0), "GR: recover");
        require(nonce == userNonce[wallet], "GR: nonce");
        require(userPolicyHash[wallet] != bytes32(0), "GR: policy");
        bytes32 ih = keccak256(abi.encode(INTENT_DOMAIN_SEPARATOR, structHash));
        require(!usedIntents[ih], "GR: used");
        usedIntents[ih] = true;
        userNonce[wallet] = nonce + 1;
        emit IntentExecuted(wallet, ih, bytes32(uint256(structHash)), nonce);
    }

    function rejectIntent(bytes32 ih, string calldata reason) external onlyAgent {
        require(!usedIntents[ih], "GR: used");
        usedIntents[ih] = true;
        emit IntentRejected(address(0), ih, reason);
    }

    function setAgent(address a) external onlyOwner {
        require(a != address(0), "GR: zero");
        agent = a;
        emit AgentApproved(msg.sender, a);
    }

    function setRules(uint256 rs, uint256 tp) external onlyOwner {
        require(rs <= 100 && tp <= 100, "GR: bounds");
        maxRiskScore = rs; maxTradePercent = tp;
        emit RulesUpdated(msg.sender, rs, tp);
    }

    function logDecision(string calldata dh, uint256 rs) external onlyAgent {
        require(bytes(dh).length > 0 && rs <= 100, "GR: input");
        emit DecisionLogged(owner, msg.sender, dh, rs);
    }

    function revokeAgent() external onlyOwner {
        address prev = agent;
        agent = address(0);
        emit AgentRevoked(msg.sender, prev);
    }
}
