# PayoutJP

[English](./README.md) | 日本語

PayoutJPは、日本の銀行振込およびJPYCの送金先を、銀行やウォレットとの統合に渡す前に検証するための
ローカルファーストな互換性ツールキットです。

> ステータス: `0.1.0-alpha.1` 無料OSS alpha。Core、保守的なBankサブセット、および単一送金先用の
> Bank CLIをnpmで`alpha`タグとして公開しています。JPYCは未公開のライブラリプレビューとして実装済みです。
> ScannerとActionはプレースホルダーのままです。

## 設計目標

- 送金データをアップロードせず、ローカルで実行する。
- バージョン管理されたProfileとRegistryから決定論的な結果を生成する。
- 推測に基づく検証より、客観的な互換性エラーを優先する。
- 銀行振込とJPYCの検証を、資金移動から分離する。
- ライブラリ、CLI、Scanner、GitHub Actionで単一のドメイン実装を共有する。

## 安全境界

PayoutJPは以下を行いません。

- 銀行振込の実行や銀行APIへの接続。
- 口座の実在確認や、口座名義人と人物の一致確認。
- JPYCトランザクションの作成、署名、ブロードキャスト。
- 秘密鍵、シードフレーズ、銀行認証情報、顧客資産の保有。
- RPC呼び出しや、残高、ガス、レシート、承認状況の確認。
- 検証データのアップロードやテレメトリーの送信。

## ワークスペース

```text
packages/
  core/
  bank/
  jpyc/
  scanner/
  cli/
  action/
```

`@payoutjp/core`は、決定論的な検証コントラクト、エンジン、秘匿化プリミティブを提供します。
`@payoutjp/bank`は、保守的なBank検証を提供します。`@payoutjp/jpyc`は、正確な公式Registry
スナップショットを使用したJPYC送金先およびアプリケーション設定の検証を提供します。
`@payoutjp/cli`は、実装済みのJSON単一Bank送金先用`validate`コマンドを、テキスト／JSONレポートと
CI向け終了コード付きで提供します。ScannerとActionは初期構成用のexportのみを保持しています。

本番用銀行データ、プロバイダー固有のBankルール、実験的な全銀／ゆうちょProfile、Scanner、および
GitHub Actionの動作は、実装済みスコープに含まれません。

## CLI

現在のCLIは、UTF-8 JSON形式のBank送金先またはリクエストラッパーを1件受け付けます。送金先を直接
指定する場合は、Profileを明示的に選択する必要があります。

alpha版をインストールします。

```sh
npm install --global @payoutjp/cli@alpha
payoutjp --version
```

まず、架空データを使った`destination.json`を作成します。

```json
{
  "schemaVersion": "1",
  "rail": "bank_transfer",
  "bankCode": "1234",
  "branchCode": "001",
  "accountType": "ordinary",
  "accountNumber": "0123456",
  "accountHolder": "SYNTHETIC"
}
```

次に実行します。

```sh
payoutjp validate destination.json --profile bank-generic-jp@0.1.0
```

ソースをチェックアウトして使用する場合は、先にビルドして、同等のコマンドを実行します。

```sh
node packages/cli/dist/main.js validate fixtures/bank/destinations/valid-synthetic.json \
  --profile bank-generic-jp@0.1.0
```

CIでは`--format json`、`--output <path>`、`--fail-on <error|warning|never>`を使用できます。
明示的な`--config`または`./payoutjp.config.yml`では、`failOn`とローカルJSONのProfile／Registryパスを
指定できます。相対パスは設定ファイルを基準に解決されます。YAML／CSV入力、バッチ監査、Profile／Registry
探索、JPYCのCLI検証、Scanner、および専用Actionの動作は、このM4サブセットには含まれません。

PayoutJPは、選択したProfileとRegistryに対してローカルデータと設定を検査します。口座の実在、受取人の
本人性、ウォレットの所有権、支払いの成功は検証しません。本番用Bank Registryは同梱していません。
`bank-generic-jp`は、保守的な構造検査のみを実行します。

## ライブラリパッケージ

最初のalphaでは、`@payoutjp/core`、`@payoutjp/bank`、`@payoutjp/cli`を公開しています。
ワークスペースルート、`@payoutjp/jpyc`、`@payoutjp/scanner`、`@payoutjp/action`は、npmのprivate
パッケージのままです。npmで公開していないパッケージを含め、このリポジトリのソースコードには
リポジトリのライセンスが適用されます。

## 開発

必要な環境:

- Node.js 24
- Corepack経由のpnpm 11.25.0

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm verify
pnpm release:check
```

`pnpm verify`は、全ワークスペースパッケージのフォーマット検査、lint、厳格なTypeScript検査、
スモークテスト、ビルドを実行します。

`pnpm release:check`はさらに、本番依存関係の監査、3つの公開パッケージのpack、空の一時consumerへの
インストール、manifestとライセンスの検査、公開APIのimport、パッケージ化されたCLIの実行を行います。
このコマンドがpublish、タグ作成、成果物の保存を行うことはありません。

プロジェクトとリリースの方針については、[CONTRIBUTING.md](./CONTRIBUTING.md)、
[SECURITY.md](./SECURITY.md)、[CHANGELOG.md](./CHANGELOG.md)、[RELEASING.md](./RELEASING.md)を
参照してください。

## 技術ドキュメント

- [スコープと対象外](./docs/02_SCOPE_AND_NON_GOALS.md)
- [ドメインモデル](./docs/03_DOMAIN_MODEL.md)
- [アーキテクチャ](./docs/04_ARCHITECTURE.md)
- [データコントラクト](./docs/05_DATA_CONTRACTS.md)
- [ルールカタログ](./docs/06_RULE_CATALOG.md)
- [RegistryとProfile](./docs/07_REGISTRIES_AND_PROFILES.md)
- [CLI仕様](./docs/08_CLI_SPEC.md)
- [Scanner仕様](./docs/09_SCANNER_SPEC.md)
- [GitHub Action仕様](./docs/10_GITHUB_ACTION_SPEC.md)
- [テスト戦略](./docs/11_TEST_STRATEGY.md)
- [セキュリティ、プライバシー、法的事項](./docs/12_SECURITY_PRIVACY_LEGAL.md)
- [リポジトリツール](./docs/13_REPOSITORY_TOOLING.md)
- [リリースとバージョニング](./docs/14_RELEASE_VERSIONING.md)
- [アーキテクチャ決定記録](./docs/adr/)

これらのドキュメントには、実装済みの動作だけでなく、意図した動作も記載されています。現在利用できる
機能については、上記のステータス表示と公開済みパッケージのバージョンが正本です。

## ライセンス

[Apache License 2.0](./LICENSE)の下でライセンスされています。このライセンスはプロジェクトの商標権を
許諾するものではありません。第三者のRegistryデータおよび将来個別に配布される成果物には、それぞれ
異なる利用条件が適用される場合があります。
