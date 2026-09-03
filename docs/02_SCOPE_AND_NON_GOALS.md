# 02 — Scope and Non-goals

## 1. v0.1 scope

### Bank destination validation

- canonical input schema
- bank code and branch code syntax
- Registry lookup and bank-branch relation
- profile-driven account type
- account number digits and length
- account holder required value
- leading/trailing whitespace
- control/invisible characters
- Unicode normalization difference
- profile-driven character set and encoded byte length
- privacy-safe findings

### JPYC destination validation

- wallet address syntax
- zero address
- checksum policy
- selected chain support
- current official contract mapping in Registry
- configured contract mismatch
- token contract accidentally used as recipient
- current-vs-non-current detection without on-chain calls

### Configuration scanner

- JSON
- YAML
- `.env` and `.env.*`
- TypeScript/JavaScript and other text files using limited heuristics
- standard source location
- redacted finding output

### Developer interfaces

- TypeScript public API
- CLI
- GitHub JavaScript Action
- text and JSON report

## 2. Explicit non-goals

### Money movement

- 振込ファイルを銀行へ送信する。
- 銀行APIへ振込指図する。
- JPYC transactionを生成・署名・送付する。
- 送金手数料を徴収する。
- 支払バッチを実行する。

### Verification beyond compatibility

- 口座の存在確認
- 口座名義と受取人本人の一致確認
- wallet ownership proof
- KYC/KYB/AML
- sanctions screening
- blockchain balance、gas、receipt、confirmation

### Custody / secrets

- private key、seed phrase、bank credentialを受け取る。
- walletを生成する。
- secrets managerになる。
- source fileを実行する。

### Hosted SaaS

- API server
- database
- authentication
- dashboard
- billing
- usage metering
- centralized telemetry
- customer data upload

### Services

- 個別導入代行
- 顧客別ルール作成代行
- 人力での振込先確認
- 24/7 SLA
- 法律・会計・銀行実務の保証

## 3. Scope by phase

| Capability | v0.1 | RC | Future |
|---|---:|---:|---:|
| TypeScript API | Yes | Yes | Yes |
| CLI text/JSON | Yes | Yes | Yes |
| Canonical CSV | Yes | Yes | Yes |
| GitHub Action | Yes | Yes | Yes |
| SARIF/JUnit | No | Yes | Yes |
| Bank production Registry | Blocked | Required for launch | Yes |
| JPYC current mainnet Registry | Yes | Yes | Yes |
| Historical JPYC provenance Registry | Optional | Maybe | Yes |
| Signed rule packs | No | No | Maybe |
| Web UI | No | No | Unapproved |
| Hosted API | No | No | Unapproved |
| Bank/JPYC execution | Never | Never | Never |

## 4. Profile policy

- `verified`: source and semantics are sufficiently documented for normal use.
- `experimental`: known limitations or source uncertainty exists. Must emit metadata in reports.
- `deprecated`: retained for reproducibility but not recommended.
- `retired`: unavailable for new runs unless explicitly enabled.

`zengin-fb-draft` and `yucho-transfer-draft` begin as`experimental`. Exact bank/service behavior must not be generalized without evidence.

## 5. Auto-fix policy

v0.1は`--fix`を提供しない。

理由：

- 口座名義は銀行登録内容との一致が重要。
- 全角/半角、小書きカナ、法人略称はProfileによって期待値が異なる。
- account numberの左ゼロ付与は意味を変える可能性がある。
- wallet addressのcase修正は人間確認なしに保存値を変えるべきでない。

Findingは`suggestion`を持てるが、原入力を書き換えない。

## 6. Change control

次を追加する場合、ADRが必要。

- ネットワークアクセス
- 顧客データ保存
- 新しいrail
- 自動修正
- production bank Registry provider
- signed pack distribution
- Web UI/API
- 法的に送金・媒介・管理へ近づく機能
