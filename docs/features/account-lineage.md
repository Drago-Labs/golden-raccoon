# Account lineage

The trace reads `create_account` and sponsored creation, then walks creators up to a hop limit. A repeated account stops the walk and is labeled a cycle. Missing history is labeled missing and is not treated as a root account. Early payments and path payments are capped. Exchange and anchor labels come from published `stellar.toml` data or configured records. Unlabeled accounts stay unlabeled. The page does not identify people.
