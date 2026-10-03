# @payoutjp/bank

Conservative structural validation for Japanese bank-transfer destinations. The package does not
bundle a production Bank Registry and does not verify account existence or ownership.

Version `0.1.0-alpha.2` adds `prepareBankTransferValidatorV1` for repeated validation. Requires Node.js 24.

```sh
npm install @payoutjp/bank@0.1.0-alpha.2
```

```ts
import { prepareBankTransferValidatorV1 } from "@payoutjp/bank";

const validate = prepareBankTransferValidatorV1();
const findings = validate({
  schemaVersion: "1",
  rail: "bank_transfer",
  bankCode: "1234",
  branchCode: "001",
  accountType: "ordinary",
  accountNumber: "0123456",
  accountHolder: "SYNTHETIC",
}, 0);
```

The default `bank-generic-jp@0.1.0` Profile performs conservative structural checks only.
Preparation validates and owns an immutable Profile/Registry snapshot and builds lookup indexes once.
Pass `{ profile, registries, allowExperimental }` to use explicitly installed data. The returned
function accepts untrusted destinations and an optional zero-based item index, and returns safe
`FindingV1[]`; malformed input throws a typed input error. The existing
`validateBankTransferDestinationV1(input, options)` API remains available for single destinations.
Neither API performs I/O, network access, input mutation, or automatic corrections.

Keep ID/version/digest references fixed for reproducibility. A matching Registry digest verifies
integrity, not completeness, freshness, or bank-account existence. Bank/branch observed values are
metadata-only in alpha.2 findings to protect values placed in the wrong input field.

See the [PayoutJP repository](https://github.com/inthecradle/payoutjp) for profiles, local Registry
injection, safety boundaries, and examples. Licensed under Apache-2.0.
