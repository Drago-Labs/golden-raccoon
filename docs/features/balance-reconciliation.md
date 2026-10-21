# Balance reconciliation

This page rebuilds an account's balances across a ledger window and compares them with the balances recorded at the end of that window.

Effects are classified as credit, debit, fee, trade, pool, claimable, or clawback. Amounts are converted to stroops and added with integers. An asset's identity is `native` or `CODE:ISSUER`. Two assets that share a code and have different issuers stay separate.

The opening balance is the recorded balance at the start of the window. Each in-window effect and fee updates a running total. The fee on a fee-bump transaction is charged to the fee account, which is the sponsor, not the inner source account.

The end total is compared with the recorded end balance. The difference is the unexplained delta. A missing end balance, an unclassified effect, or a truncated effect page means the report is partial and is not called a match, even if the visible stroops agree.

The page does not convert prices, compute tax or cost basis, or change a risk score.
