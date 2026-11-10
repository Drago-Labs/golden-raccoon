# ENS Forward & Reverse Resolution Verifier

Normalises ENS names, flags mixed-script and zero-width Unicode confusables, resolves forward (`name -> address`) and reverse (`address -> name -> address`) records at a recorded block, inspects registration ownership and expiry, and classifies the pair as `verified`, `forward_only`, `reverse_only`, `mismatched`, or `expired`.
