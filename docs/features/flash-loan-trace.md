# Flash-loan trace method

Transactions are bounded by block range and retained only when they touch a supplied protocol contract. Detection recognizes recorded Aave, Balancer, Uniswap flash-swap, and Maker flash-mint evidence. Execution traces define call order when available; otherwise ordered logs create a clearly labelled lower-fidelity path. Borrow and repayment events are summed by participant and asset, and net change is `borrowed - repaid`. The feature never labels a transaction as an attack.
